import importlib
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

companion = Path(__file__).resolve().parent / '../../../trading-integration/assets/python'
if companion.is_dir():
    sys.path.insert(0, str(companion))


class BotTests(unittest.TestCase):
    def test_plan_keeps_the_evm_quantity_equal_to_the_shield_input(self):
        self.assertTrue(Path(__file__).with_name('bot.py').exists())
        from bot import ArbitrageBot, Strategy
        from trading import Offer
        from uniswap import BuyQuote
        import time
        requests = []
        native = {'amount_in': '0.01', 'minimum_amount_out': '31', 'token_in_decimals': 18, 'token_out_decimals': 6,
                  'token_in_id': '2field', 'token_out_id': '3field'}
        venue = SimpleNamespace(scope='aleo:mainnet:a', network='mainnet',
            quote=lambda *args, **kw: Offer('aleo:mainnet:a', native, time.time(), 20),
            inventory=lambda token: SimpleNamespace(available=[SimpleNamespace(amount=10**18)]))
        shield = SimpleNamespace(venue=venue, execution_enabled=False)
        def quote(amount, **kw):
            requests.append(amount)
            return BuyQuote(1, 'quote', 'base', 3000, amount, 29_000_000, 30_000_000, time.time(), 1)
        evm = SimpleNamespace(scope='evm:1:b', execution_enabled=False, account=SimpleNamespace(address='b'),
            metadata=lambda: {'base_decimals': 18, 'quote_decimals': 6}, quote_exact_output=quote,
            balances=lambda address: {'quote': 100_000_000, 'allowance': 100_000_000, 'gas': 10**18},
            preflight=lambda *args, **kwargs: {'gas_ceiling_wei': 1})
        strategy = Strategy('ETH', 'USDCx', '2field', '3field', '0.01', 50, 20, '0.2', '0.5', True, 10**15, 2)
        with tempfile.TemporaryDirectory() as root:
            bot = ArbitrageBot(shield, evm, strategy, Path(root) / 'cycles.sqlite')
            plan = bot.plan()
            self.assertEqual(requests, [10_000_000_000_000_000])
            self.assertTrue(plan['decision']['eligible'])
            self.assertEqual(plan['decision']['net_quote_atoms'], 800_000)
            def exceeds_gas(*args, **kwargs):
                raise ValueError('gas budget')
            evm.preflight = exceeds_gas
            self.assertFalse(bot.plan()['decision']['eligible'])
            evm.preflight = lambda *args, **kwargs: {'gas_ceiling_wei': 1}
            # An approval deficit blocks execution readiness without changing the edge estimate.
            evm.balances = lambda address: {'quote': 100_000_000, 'allowance': 0, 'gas': 10**18}
            self.assertFalse(bot.plan()['decision']['eligible'])


if __name__ == '__main__':
    unittest.main()
