import importlib.util
import sys
import unittest
import tempfile
from pathlib import Path

companion = Path(__file__).resolve().parent / '../../../trading-integration/assets/python'
if companion.is_dir():
    sys.path.insert(0, str(companion))


@unittest.skipUnless(importlib.util.find_spec('web3'), 'installed-package checks need web3')
class UniswapTests(unittest.TestCase):
    def venue(self, root):
        from uniswap import UniswapV3
        from web3 import Web3
        from web3.providers import BaseProvider
        from eth_account import Account
        class RPC(BaseProvider):
            def make_request(self, method, params):
                values = {'eth_chainId': '0x1', 'eth_gasPrice': hex(10**9), 'eth_getBalance': hex(10**18),
                          'eth_getTransactionCount': '0x0', 'eth_estimateGas': hex(200_000), 'eth_blockNumber': '0xa'}
                if method == 'eth_call':
                    result = '0x' + (10**20).to_bytes(32, 'big').hex()
                elif method == 'eth_sendRawTransaction':
                    raise TimeoutError('response lost after acceptance')
                elif method == 'eth_getTransactionReceipt':
                    result = None
                else:
                    result = values[method]
                return {'jsonrpc': '2.0', 'id': 1, 'result': result}
        w3 = Web3(RPC())
        return UniswapV3(w3, chain_id=1, quoter='0x'+'11'*20, router='0x'+'22'*20,
            base_token='0x'+'33'*20, quote_token='0x'+'44'*20, fee=3000,
            account=Account.create(), state_path=Path(root)/'evm.sqlite', execution_enabled=True)

    def offer(self, venue):
        from uniswap import BuyQuote
        import time
        return BuyQuote(1, venue.quote_token.address, venue.base.address, 3000, 10**16, 29_000_000, 30_000_000, time.time(), 1)

    def test_changed_signer_fails_before_registering_or_signing(self):
        from eth_account import Account
        with tempfile.TemporaryDirectory() as root:
            venue = self.venue(root)
            venue.account = Account.create()
            with self.assertRaisesRegex(ValueError, 'signer'):
                venue.approve('one', 1000, gas_budget_wei=10**15)
            self.assertIsNone(venue.store.get('one'))

    def test_preflight_detects_unaffordable_gas_without_a_transaction(self):
        with tempfile.TemporaryDirectory() as root:
            venue = self.venue(root)
            with self.assertRaisesRegex(ValueError, 'gas'):
                venue.preflight(self.offer(venue), max_age=20, gas_budget_wei=1)
            self.assertIsNone(venue.store.get('one'))

    def test_lost_evm_response_keeps_the_locally_derived_hash_and_never_resigns(self):
        with tempfile.TemporaryDirectory() as root:
            venue = self.venue(root)
            row = venue.approve('one', 1000, gas_budget_wei=10**15)
            self.assertEqual(row['status'], 'submission_unknown')
            self.assertRegex(row['tx_hash'], '^0x[0-9a-f]{64}$')
            self.assertEqual(venue.web3.to_hex(venue.web3.keccak(hexstr=row['raw_transaction'])), row['tx_hash'])
            self.assertEqual(venue.approve('one', 1000, gas_budget_wei=10**15)['tx_hash'], row['tx_hash'])
            self.assertEqual(venue.status('one', confirmations=2)['status'], 'submission_unknown')

    def test_exact_output_calldata_keeps_maximum_input_and_deadline(self):
        self.assertTrue(Path(__file__).with_name('uniswap.py').exists())
        from uniswap import ROUTER_ABI
        from web3 import Web3
        w3 = Web3()
        contract = w3.eth.contract(address='0x' + '11' * 20, abi=ROUTER_ABI)
        args = ('0x' + '22' * 20, '0x' + '33' * 20, 3000, '0x' + '44' * 20, 2_000_000_000, 10**16, 30_000_000, 0)
        encoded = contract.encode_abi('exactOutputSingle', args=[args])
        method, result = contract.decode_function_input(encoded)
        self.assertEqual(method.fn_name, 'exactOutputSingle')
        self.assertEqual(result['params']['amountInMaximum'], 30_000_000)
        self.assertEqual(result['params']['amountOut'], 10**16)
        self.assertEqual(result['params']['deadline'], 2_000_000_000)


if __name__ == '__main__':
    unittest.main()
