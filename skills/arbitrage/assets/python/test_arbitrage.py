import importlib
import sys
import tempfile
import time
import unittest
from pathlib import Path

# Installed projects put the two skills' modules together, or install the
# trading modules as their own package. This source-tree test supplies that path.
companion = Path(__file__).resolve().parent / '../../../trading-integration/assets/python'
if companion.is_dir():
    sys.path.insert(0, str(companion))


class ArbitrageTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(Path(__file__).with_name('arbitrage.py').exists(), 'arbitrage implementation required')
        self.mod = importlib.import_module('arbitrage')

    def plan(self, **changes):
        values = dict(base_amount='0.01', base_decimals=18, shield_out_decimals=6, evm_quote_decimals=6,
                      shield_min_out='31', evm_max_in=30_000_000, costs='0.2', min_profit='0.5',
                      max_age=20, shield_quoted_at=time.time(), evm_quoted_at=time.time(), equivalence_confirmed=True)
        return self.mod.evaluate(**(values | changes))

    def test_profit_uses_output_floor_maximum_cost_and_extra_fees(self):
        result = self.plan()
        self.assertTrue(result['eligible'])
        self.assertEqual(result['net_quote_atoms'], 800_000)
        self.assertEqual(result['base_atoms'], 10_000_000_000_000_000)

    def test_subthreshold_stale_and_unconfirmed_asset_equivalence_do_not_trade(self):
        self.assertFalse(self.plan(costs='1')['eligible'])
        self.assertFalse(self.plan(shield_quoted_at=time.time() - 21)['eligible'])
        self.assertFalse(self.plan(equivalence_confirmed=False)['eligible'])

    def test_units_are_exact_and_excess_precision_is_rejected(self):
        result = self.plan(base_amount='0.000000000000000001')
        self.assertEqual(result['base_atoms'], 1)
        with self.assertRaises(ValueError):
            self.plan(base_amount='0.0000000000000000001')
        with self.assertRaises(ValueError):
            self.plan(costs='NaN')
        with self.assertRaises(ValueError):
            self.plan(costs='-1')

    def test_different_quote_decimals_are_normalized_without_rounding(self):
        result = self.plan(evm_quote_decimals=18, evm_max_in=30_000_000_000_000_000_000)
        self.assertEqual(result['net_quote_atoms'], 800_000_000_000_000_000)


if __name__ == '__main__':
    unittest.main()
