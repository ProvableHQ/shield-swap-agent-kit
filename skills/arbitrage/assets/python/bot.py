"""Callable reference bot: sell on Shield Swap, buy the same quantity on Uniswap v3."""
from __future__ import annotations

import time
from dataclasses import asdict, dataclass

from arbitrage import atoms, evaluate
from cycle import Cycle
from uniswap import BuyQuote


def token_units(value, decimals):
    if type(value) is not int or value < 0:
        raise ValueError('Invalid base-unit amount')
    if decimals == 0:
        return str(value)
    digits = str(value).zfill(decimals + 1)
    return digits[:-decimals] + '.' + digits[-decimals:]


@dataclass(frozen=True)
class Strategy:
    shield_base: str
    shield_quote: str
    shield_base_id: str
    shield_quote_id: str
    base_amount: str
    slippage_bps: int
    max_age: float
    costs: str
    min_profit: str
    equivalence_confirmed: bool
    gas_budget_wei: int
    confirmations: int

    def __post_init__(self):
        if atoms(self.base_amount, 38) <= 0 or type(self.slippage_bps) is not int or not 0 <= self.slippage_bps < 10_000:
            raise ValueError('Set a positive trade size and integer slippage basis points')
        if not 0 < self.max_age <= 60 or type(self.gas_budget_wei) is not int or self.gas_budget_wei <= 0:
            raise ValueError('Set quote age (at most 60 seconds) and a positive gas budget')
        if type(self.confirmations) is not int or self.confirmations < 1:
            raise ValueError('Set a positive confirmation count')
        atoms(self.costs, 38)
        atoms(self.min_profit, 38)


class ArbitrageBot:
    def __init__(self, shield_trading, uniswap, strategy, state_path):
        self.shield, self.uniswap, self.strategy = shield_trading, uniswap, strategy
        self.cycle = Cycle(shield_trading, uniswap, state_path, refresh_buy=self.refresh_buy)

    def decision(self, offer, buy, metadata, *, actual_output=None):
        cfg = self.strategy
        quote = offer['native']
        if (quote['token_in_id'], quote['token_out_id']) != (cfg.shield_base_id, cfg.shield_quote_id):
            raise ValueError('Shield token ids differ from the configured asset correspondence')
        if atoms(quote['amount_in'], quote['token_in_decimals']) != atoms(cfg.base_amount, quote['token_in_decimals']):
            raise ValueError('The Shield quote changed the configured input amount')
        if buy.amount_out != atoms(cfg.base_amount, metadata['base_decimals']):
            raise ValueError('The two legs must trade the same base-asset quantity')
        return evaluate(base_amount=cfg.base_amount, base_decimals=metadata['base_decimals'],
            shield_out_decimals=quote['token_out_decimals'], evm_quote_decimals=metadata['quote_decimals'],
            shield_min_out=actual_output if actual_output is not None else quote['minimum_amount_out'],
            evm_max_in=buy.maximum_in, costs=cfg.costs, min_profit=cfg.min_profit,
            max_age=cfg.max_age, shield_quoted_at=time.time() if actual_output is not None else offer['quoted_at'],
            evm_quoted_at=buy.quoted_at, equivalence_confirmed=cfg.equivalence_confirmed)

    def funding_ready(self, offer, buy):
        inventory = self.shield.venue.inventory(self.strategy.shield_base)
        required = atoms(offer['native']['amount_in'], offer['native']['token_in_decimals'])
        covering = any(record.amount >= required for record in inventory.available)
        if self.uniswap.account is None:
            return False
        balances = self.uniswap.balances(self.uniswap.account.address)
        ready = covering and min(balances['quote'], balances['allowance']) >= buy.maximum_in and balances['gas'] >= self.strategy.gas_budget_wei
        if not ready:
            return False
        try:
            self.uniswap.preflight(buy, max_age=self.strategy.max_age, gas_budget_wei=self.strategy.gas_budget_wei)
        except ValueError:
            return False
        return True

    def plan(self):
        """Read quotes and available inventory. No signing, approvals, or transfers."""
        cfg = self.strategy
        metadata = self.uniswap.metadata()
        offer = asdict(self.shield.venue.quote(cfg.shield_base, cfg.shield_quote, cfg.base_amount,
                        slippage_bps=cfg.slippage_bps, max_age=cfg.max_age))
        buy = self.uniswap.quote_exact_output(atoms(cfg.base_amount, metadata['base_decimals']), slippage_bps=cfg.slippage_bps)
        decision = self.decision(offer, buy, metadata)
        decision['funding_ready'] = self.funding_ready(offer, buy)
        decision['eligible'] = decision['eligible'] and decision['funding_ready']
        return {'scope': self.cycle.scope, 'shield': offer, 'buy': asdict(buy),
                'policy': asdict(cfg), 'metadata': metadata, 'decision': decision}

    def execute(self, cycle_id, plan):
        """Execute one reviewed cycle. Use the same cycle id after interruption."""
        if self.cycle.store.get(cycle_id):
            # Never reinterpret the same id as a new quote or new trade.
            return self.cycle.execute(cycle_id, plan)
        if plan['policy'] != asdict(self.strategy) or plan['scope'] != self.cycle.scope:
            raise ValueError('Plan does not match the selected accounts and strategy limits')
        buy = BuyQuote(**plan['buy'])
        decision = self.decision(plan['shield'], buy, plan['metadata'])
        if not decision['eligible'] or not self.funding_ready(plan['shield'], buy):
            raise ValueError('Quotes expired, edge is insufficient, or funds/allowance are unavailable')
        return self.cycle.execute(cycle_id, plan)

    def refresh_buy(self, plan, actual):
        if plan['policy'] != asdict(self.strategy):
            raise ValueError('Resume with the original strategy configuration')
        original = BuyQuote(**plan['buy'])
        fresh = self.uniswap.quote_exact_output(original.amount_out, slippage_bps=self.strategy.slippage_bps)
        if (fresh.chain_id, fresh.token_in, fresh.token_out, fresh.fee) != (original.chain_id, original.token_in, original.token_out, original.fee):
            raise ValueError('The configured Uniswap route changed')
        proceeds = token_units(int(actual['amount_out']), plan['shield']['native']['token_out_decimals'])
        decision = self.decision(plan['shield'], fresh, plan['metadata'], actual_output=proceeds)
        # A new quote may improve terms, but cannot increase the previously reviewed spend ceiling.
        return fresh, decision['eligible'] and fresh.maximum_in <= original.maximum_in

    def resume(self, cycle_id):
        return self.cycle.resume(cycle_id)
