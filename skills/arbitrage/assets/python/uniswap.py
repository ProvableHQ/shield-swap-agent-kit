"""Single-pool Uniswap v3 exact-output trades through the original SwapRouter.

Addresses are configuration, verified against Uniswap's deployment list. This
ABI includes deadline; SwapRouter02 has a different tuple and is not accepted.
"""
from __future__ import annotations

import time
from dataclasses import asdict, dataclass

from operations import OperationStore


def abi_function(name, names, types, outputs, *, tuple_input=False, mutability='view'):
    inputs = [{'name': n, 'type': t} for n, t in zip(names, types)]
    return {'name': name, 'type': 'function', 'stateMutability': mutability,
            'inputs': [{'name': 'params', 'type': 'tuple', 'components': inputs}] if tuple_input else inputs,
            'outputs': [{'name': n, 'type': t} for n, t in outputs]}


ROUTER_ABI = [abi_function('exactOutputSingle',
    ['tokenIn', 'tokenOut', 'fee', 'recipient', 'deadline', 'amountOut', 'amountInMaximum', 'sqrtPriceLimitX96'],
    ['address', 'address', 'uint24', 'address', 'uint256', 'uint256', 'uint256', 'uint160'],
    [('amountIn', 'uint256')], tuple_input=True, mutability='payable')]
QUOTER_ABI = [abi_function('quoteExactOutputSingle',
    ['tokenIn', 'tokenOut', 'amount', 'fee', 'sqrtPriceLimitX96'],
    ['address', 'address', 'uint256', 'uint24', 'uint160'],
    [('amountIn', 'uint256'), ('sqrtPriceX96After', 'uint160'), ('initializedTicksCrossed', 'uint32'), ('gasEstimate', 'uint256')],
    tuple_input=True, mutability='nonpayable')]
ERC20_ABI = [
    abi_function('balanceOf', ['owner'], ['address'], [('', 'uint256')]),
    abi_function('allowance', ['owner', 'spender'], ['address', 'address'], [('', 'uint256')]),
    abi_function('decimals', [], [], [('', 'uint8')]),
    abi_function('approve', ['spender', 'amount'], ['address', 'uint256'], [('', 'bool')], mutability='nonpayable'),
]


@dataclass(frozen=True)
class BuyQuote:
    chain_id: int
    token_in: str
    token_out: str
    fee: int
    amount_out: int
    expected_in: int
    maximum_in: int
    quoted_at: float
    block_number: int


class UniswapV3:
    def __init__(self, web3, *, chain_id, quoter, router, base_token, quote_token, fee,
                 account=None, state_path=None, execution_enabled=False):
        from web3 import Web3
        if type(chain_id) is not int or chain_id <= 0 or type(fee) is not int or not 0 < fee < 1_000_000:
            raise ValueError('Explicit chain id and pool fee are required')
        self.web3, self.chain_id, self.fee = web3, chain_id, fee
        addresses = [Web3.to_checksum_address(a) for a in (quoter, router, base_token, quote_token)]
        if len(set(addresses)) != 4 or any(int(a, 16) == 0 for a in addresses):
            raise ValueError('Supply distinct, nonzero deployment and token addresses')
        self.quoter = web3.eth.contract(address=addresses[0], abi=QUOTER_ABI)
        self.router = web3.eth.contract(address=addresses[1], abi=ROUTER_ABI)
        self.base = web3.eth.contract(address=addresses[2], abi=ERC20_ABI)
        self.quote_token = web3.eth.contract(address=addresses[3], abi=ERC20_ABI)
        self.account = account
        self.signer_address = account.address.lower() if account else None
        self.execution_enabled = execution_enabled
        self.store = OperationStore(state_path) if state_path is not None else None
        self.scope = f'evm:{chain_id}:{account.address.lower()}' if account else f'evm:{chain_id}:read-only'

    def check_chain(self):
        if self.web3.eth.chain_id != self.chain_id:
            raise ValueError('RPC chain does not match the configured Uniswap deployment')

    def check_signer(self):
        if self.account is None or self.account.address.lower() != self.signer_address:
            raise ValueError('The EVM signer changed; reopen the original account session')

    def metadata(self):
        self.check_chain()
        for contract in (self.quoter, self.router, self.base, self.quote_token):
            if not self.web3.eth.get_code(contract.address):
                raise ValueError('A configured Uniswap contract or token has no deployed code')
        return {'base_decimals': self.base.functions.decimals().call(), 'quote_decimals': self.quote_token.functions.decimals().call()}

    def quote_exact_output(self, amount_out, *, slippage_bps):
        self.check_chain()
        if type(amount_out) is not int or amount_out <= 0 or type(slippage_bps) is not int or not 0 <= slippage_bps < 10_000:
            raise ValueError('Invalid output amount or slippage')
        started = time.time()
        block = self.web3.eth.block_number
        result = self.quoter.functions.quoteExactOutputSingle((self.quote_token.address, self.base.address, amount_out, self.fee, 0)).call(block_identifier=block)
        expected = int(result[0])
        if expected <= 0:
            raise ValueError('Quote has no positive input amount')
        maximum = (expected * (10_000 + slippage_bps) + 9_999) // 10_000
        return BuyQuote(self.chain_id, self.quote_token.address, self.base.address, self.fee, amount_out, expected, maximum, started, block)

    def balances(self, address):
        self.check_chain()
        return {'base': self.base.functions.balanceOf(address).call(),
                'quote': self.quote_token.functions.balanceOf(address).call(),
                'gas': self.web3.eth.get_balance(address),
                'allowance': self.quote_token.functions.allowance(address, self.router.address).call()}

    def _send(self, operation_id, intent, call, *, gas_budget_wei):
        if not self.execution_enabled or self.account is None or self.store is None:
            raise PermissionError('A signer, durable state and execution authorization are required')
        self.check_signer()
        signer = self.account
        self.check_chain()
        if type(gas_budget_wei) is not int or gas_budget_wei <= 0:
            raise ValueError('Set a positive per-transaction gas budget in wei')
        row, created = self.store.begin(operation_id, self.scope, intent, capacity=1)
        if not created:
            return row
        try:
            gas = (call.estimate_gas({'from': signer.address}) * 120 + 99) // 100
            price = self.web3.eth.gas_price
            if gas * price > gas_budget_wei or self.web3.eth.get_balance(signer.address) < gas * price:
                self.store.transition(operation_id, 'submitting', 'failed', reason='gas_budget_or_balance')
                return self.store.get(operation_id)
            transaction = call.build_transaction({'from': signer.address, 'chainId': self.chain_id,
                'nonce': self.web3.eth.get_transaction_count(signer.address, 'pending'), 'gas': gas, 'gasPrice': price})
            self.check_signer()
            signed = signer.sign_transaction(transaction)
            tx_hash = self.web3.to_hex(signed.hash)
            # Save the exact signed transaction and its hash before broadcasting.
            self.store.transition(operation_id, 'submitting', 'prepared', tx_hash=tx_hash,
                                  raw_transaction=self.web3.to_hex(signed.raw_transaction), gas_ceiling_wei=str(gas * price))
            returned = self.web3.to_hex(self.web3.eth.send_raw_transaction(signed.raw_transaction))
            if returned.lower() != tx_hash.lower():
                raise RuntimeError('Broadcast returned a different transaction hash')
            self.store.transition(operation_id, 'prepared', 'submitted')
        except Exception as error:
            current = self.store.get(operation_id)
            if current['status'] in ('submitting', 'prepared'):
                self.store.transition(operation_id, current['status'], 'submission_unknown', error_type=type(error).__name__)
        return self.store.get(operation_id)

    def approve(self, operation_id, amount, *, gas_budget_wei):
        """Explicit allowance setup, separate from the arbitrage execution window."""
        if type(amount) is not int or amount <= 0:
            raise ValueError('Approve a specific positive base-unit amount')
        return self._send(operation_id, {'kind': 'approve', 'token': self.quote_token.address, 'spender': self.router.address, 'amount': str(amount)},
                          self.quote_token.functions.approve(self.router.address, amount), gas_budget_wei=gas_budget_wei)

    def swap_call(self, offer, *, max_age):
        if not self.account:
            raise PermissionError('A signer is required')
        self.check_signer()
        if (offer.chain_id, offer.token_in, offer.token_out, offer.fee) != (self.chain_id, self.quote_token.address, self.base.address, self.fee):
            raise ValueError('Uniswap quote belongs to another route or chain')
        if not 0 < max_age <= 60 or not 0 <= time.time() - offer.quoted_at < max_age:
            raise ValueError('Uniswap quote expired')
        deadline = int(offer.quoted_at + max_age)
        return self.router.functions.exactOutputSingle((offer.token_in, offer.token_out, offer.fee,
            self.account.address, deadline, offer.amount_out, offer.maximum_in, 0))

    def preflight(self, offer, *, max_age, gas_budget_wei):
        """Simulate the actual route and check gas before the first venue trades."""
        self.check_chain()
        call = self.swap_call(offer, max_age=max_age)
        balances = self.balances(self.account.address)
        if min(balances['quote'], balances['allowance']) < offer.maximum_in:
            raise ValueError('Fund the quote token and set its allowance before starting a cycle')
        if type(gas_budget_wei) is not int or gas_budget_wei <= 0:
            raise ValueError('Set a positive gas budget in wei')
        gas = (call.estimate_gas({'from': self.account.address}) * 120 + 99) // 100
        ceiling = gas * self.web3.eth.gas_price
        if ceiling > gas_budget_wei or ceiling > balances['gas']:
            raise ValueError('The EVM gas estimate exceeds its budget or balance')
        return {'gas_ceiling_wei': ceiling, 'gas': gas}

    def execute(self, operation_id, offer, *, max_age, gas_budget_wei):
        self.preflight(offer, max_age=max_age, gas_budget_wei=gas_budget_wei)
        call = self.swap_call(offer, max_age=max_age)
        return self._send(operation_id, asdict(offer), call, gas_budget_wei=gas_budget_wei)

    def status(self, operation_id, *, confirmations):
        """Read the original receipt. Never replace, re-sign, or rebroadcast a trade."""
        from web3.exceptions import TransactionNotFound
        if self.store is None or type(confirmations) is not int or confirmations < 1:
            raise ValueError('Durable state and a positive confirmation count are required')
        self.check_chain()
        self.check_signer()
        row = self.store.get(operation_id)
        if row is None or row['scope'] != self.scope:
            raise ValueError('Unknown operation or wrong account')
        if not row.get('tx_hash') or row['status'] in ('complete', 'failed'):
            return row
        try:
            receipt = self.web3.eth.get_transaction_receipt(row['tx_hash'])
        except TransactionNotFound:
            return row
        if self.web3.eth.block_number - receipt['blockNumber'] + 1 < confirmations:
            return row
        self.store.transition(operation_id, row['status'], 'complete' if receipt['status'] == 1 else 'failed',
            receipt={'transaction_hash': self.web3.to_hex(receipt['transactionHash']), 'block_number': receipt['blockNumber'],
                     'gas_used': receipt['gasUsed'], 'effective_gas_price': receipt['effectiveGasPrice']})
        return self.store.get(operation_id)
