import importlib.util
import json
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

from trading import Offer, Trading
from workflow import continue_trade, discover, execute_inventory_plan, inventory_summary, plan_inventory


class ContinuationTests(unittest.TestCase):
    def test_restart_claims_only_original_requests_and_redacts_secrets(self):
        venue = SimpleNamespace(scope='aleo:testnet:fixture')
        venue.submit = Mock(return_value={'transaction_id': 'original-request', 'blinding_factor': 'secret'})
        venue.ready = Mock(return_value=False)
        venue.claim = Mock(return_value={'transaction_id': 'original-claim', 'amount_out': '10', 'amount_remaining': '2'})
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'operations.sqlite'
            first = Trading(venue, path, execution_enabled=True)
            first.execute('order', Offer(venue.scope, {'amount': '1'}, time.time(), 20))
            restarted = Trading(venue, path, execution_enabled=True)
            self.assertEqual(continue_trade(restarted, 'order')['status'], 'submitted')
            venue.ready.return_value = True
            result = continue_trade(restarted, 'order')
            self.assertEqual(result['status'], 'complete')
            self.assertEqual(result['refund_base_units'], '2')
            self.assertNotIn('secret', json.dumps(result))
            self.assertEqual(continue_trade(restarted, 'order'), result)
            venue.submit.assert_called_once()
            venue.claim.assert_called_once()

    def test_unknown_submission_is_reported_without_readiness_or_claim_attempt(self):
        venue = SimpleNamespace(scope='aleo:testnet:fixture', submit=Mock(side_effect=TimeoutError),
                                ready=Mock(), claim=Mock())
        with tempfile.TemporaryDirectory() as directory:
            trading = Trading(venue, Path(directory) / 'operations.sqlite', execution_enabled=True)
            trading.submit('order', Offer(venue.scope, {'amount': '1'}, time.time(), 20))
            self.assertEqual(continue_trade(trading, 'order')['status'], 'submission_unknown')
            venue.ready.assert_not_called()
            venue.claim.assert_not_called()


@unittest.skipUnless(importlib.util.find_spec('aleo_shield_swap'), 'native recipes need shield-swap-sdk')
class NativeWorkflowTests(unittest.TestCase):
    def test_discovery_uses_native_registry_and_pool_shapes(self):
        from aleo_shield_swap._api_models import TokenDoc, PoolStateDoc
        from aleo_shield_swap.api import PoolEntry
        plain = TokenDoc('1field', 6, 'database-id-1', 'Plain', 'PLAIN', amm_token_program='plain.aleo')
        wrapped = TokenDoc('2field', 18, 'database-id-2', 'Wrapped', 'WRAPPED',
                           amm_token_program='wrapper.aleo', underlying_program='underlying.aleo')
        pool = PoolEntry(PoolStateDoc('today', 'creator', True, '0.3', 'id', 'tx',
                                     '3field', '1field', '2field'), plain, wrapped)
        venue = SimpleNamespace(dex=SimpleNamespace(api=SimpleNamespace(
            get_tokens=lambda: [plain, wrapped], get_pools=lambda: [pool])))
        found = discover(venue)
        self.assertEqual([t['record_program'] for t in found['tokens']], ['plain.aleo', 'underlying.aleo'])
        self.assertEqual([t['id'] for t in found['tokens']], ['1field', '2field'])
        self.assertEqual(found['pools'][0]['key'], '3field')

    def test_plain_and_wrapped_inventory_use_the_correct_program(self):
        from shield import ShieldVenue
        for underlying, expected in ((None, 'plain.aleo'), ('underlying.aleo', 'underlying.aleo')):
            token = SimpleNamespace(address='1field', symbol='ASSET', underlying_program=underlying, amm_token_program='plain.aleo')
            inventory = SimpleNamespace(get_record_inventory=Mock(return_value=object()))
            venue = ShieldVenue(SimpleNamespace(journal=object(), api=SimpleNamespace(get_tokens=lambda: [token])),
                                address='fixture', network='testnet', aleo=SimpleNamespace(inventory=inventory))
            venue.inventory('1field')
            self.assertEqual(inventory.get_record_inventory.call_args.args[0].program, expected)
            venue.inventory('asset')
            self.assertEqual(inventory.get_record_inventory.call_args.args[0].program, expected)

    def test_inventory_recipe_preserves_the_reviewed_plan_and_excludes_record_plaintext(self):
        from aleo.inventory import InventoryTarget
        plan = object()
        snapshot = SimpleNamespace(balance=2_000_000, available=[SimpleNamespace(amount=2_000_000, record={'record_plaintext': 'secret'})], reserved=[object()])
        venue = SimpleNamespace(inventory=lambda _: snapshot, check_session=Mock(), record_asset=Mock(return_value=object()),
            aleo=SimpleNamespace(inventory=SimpleNamespace(plan_record_inventory=Mock(return_value=plan),
                rebalance_record_inventory=Mock(return_value='complete'))))
        summary = inventory_summary(venue, 'asset')
        self.assertNotIn('secret', json.dumps(summary))
        self.assertEqual(summary['available_record_amounts'], ['2000000'])
        reviewed = plan_inventory(venue, 'asset', count=2, minimum_base_units=500_000, max_transactions=3)
        args = venue.aleo.inventory.plan_record_inventory.call_args
        self.assertIsInstance(args.args[1], InventoryTarget)
        self.assertEqual(args.args[1].distribution, 'preserve')
        venue.aleo.inventory.rebalance_record_inventory.assert_not_called()
        execute_inventory_plan(venue, reviewed, max_fee_microcredits=100_000)
        venue.check_session.assert_called_once()
        self.assertIs(venue.aleo.inventory.rebalance_record_inventory.call_args.args[0], reviewed)


if __name__ == '__main__':
    unittest.main()
