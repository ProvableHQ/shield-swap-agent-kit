import importlib
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'trading-integration' / 'assets' / 'python'))


class CycleTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(Path(__file__).with_name('cycle.py').exists(), 'cycle implementation required')
        self.mod = importlib.import_module('cycle')
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.calls = []
        self.shield_result = {'status': 'complete', 'result': {'amount_out': '31000000', 'amount_remaining': '0'}}
        self.evm_result = {'status': 'complete', 'tx_hash': '0xoriginal'}
        self.offer = {'scope': 'aleo:mainnet:a', 'native': {'amount_in': '0.01', 'token_in_decimals': 18,
                      'token_out_decimals': 6, 'minimum_amount_out': '31'}, 'quoted_at': 0, 'max_age': 20}
        self.plan = {'shield': self.offer, 'buy': {'amount_out': 10**16}, 'policy': {'base_amount': '0.01', 'costs': '0.2', 'min_profit': '0.5',
                     'max_age': 20, 'slippage_bps': 50, 'equivalence_confirmed': True, 'gas_budget_wei': 10**15, 'confirmations': 2},
                     'decision': {'eligible': True}, 'scope': 'aleo:mainnet:a|evm:1:b'}
        owner = self

        class Shield:
            venue = SimpleNamespace(scope='aleo:mainnet:a')
            execution_enabled = True

            def execute(self, request, offer):
                owner.calls.append('shield')
                return owner.shield_result

            def status(self, request):
                return owner.shield_result

            def claim(self, request):
                return owner.shield_result

        class Evm:
            scope = 'evm:1:b'
            execution_enabled = True

            def execute(self, request, offer, **kwargs):
                owner.calls.append('evm')
                return owner.evm_result

            def status(self, request, **kwargs):
                return owner.evm_result

        self.cycle = self.mod.Cycle(Shield(), Evm(), Path(self.tmp.name) / 'cycles.sqlite',
                                    refresh_buy=lambda plan, actual: (object(), True))

    def test_completed_cycle_is_not_repeated_after_restart(self):
        self.assertEqual(self.cycle.execute('cycle-a', self.plan)['status'], 'complete')
        self.assertEqual(self.cycle.execute('cycle-a', self.plan)['status'], 'complete')
        self.assertEqual(self.calls, ['shield', 'evm'])

    def test_partial_fill_stops_before_the_second_venue(self):
        self.shield_result['result']['amount_remaining'] = '100'
        result = self.cycle.execute('partial', self.plan)
        self.assertEqual(result['status'], 'unmatched')
        self.assertEqual(self.calls, ['shield'])

    def test_unknown_shield_submission_does_not_execute_uniswap(self):
        self.shield_result = {'status': 'submission_unknown'}
        self.assertEqual(self.cycle.execute('unknown', self.plan)['status'], 'shield_pending')
        self.assertEqual(self.calls, ['shield'])

    def test_unknown_evm_submission_is_only_inspected_on_resume(self):
        self.evm_result = {'status': 'submission_unknown', 'tx_hash': '0xoriginal'}
        self.assertEqual(self.cycle.execute('unknown-evm', self.plan)['status'], 'evm_pending')
        self.assertEqual(self.cycle.resume('unknown-evm')['status'], 'evm_pending')
        self.assertEqual(self.calls, ['shield', 'evm'])

    def test_lost_edge_after_first_leg_stops_with_unmatched_inventory(self):
        self.cycle.refresh_buy = lambda plan, actual: (object(), False)
        self.assertEqual(self.cycle.execute('edge-lost', self.plan)['status'], 'unmatched')
        self.assertEqual(self.calls, ['shield'])

    def test_failed_parallel_refresh_cannot_hide_an_active_evm_submission(self):
        import threading
        from concurrent.futures import ThreadPoolExecutor
        slow_refresh = threading.Event()
        writer_started = threading.Event()
        release_writer = threading.Event()
        calls = 0
        mutex = threading.Lock()
        def refresh(plan, actual):
            nonlocal calls
            with mutex:
                calls += 1
                number = calls
            if number == 1:
                slow_refresh.set()
                self.assertTrue(writer_started.wait(3))
                raise TimeoutError('quote read failed')
            return object(), True
        def execute(*args, **kwargs):
            writer_started.set()
            self.assertTrue(release_writer.wait(3))
            return {'status': 'submitted', 'tx_hash': 'original'}
        self.cycle.refresh_buy = refresh
        self.cycle.uniswap.execute = execute
        self.evm_result = {'status': 'submitted', 'tx_hash': 'original'}
        self.cycle.store.begin('race', self.cycle.scope, self.plan, capacity=1)
        self.cycle.store.transition('race', 'submitting', 'shield_complete', shield_result=self.shield_result['result'])
        with ThreadPoolExecutor(max_workers=2) as pool:
            slow = pool.submit(self.cycle.resume, 'race')
            self.assertTrue(slow_refresh.wait(3))
            writer = pool.submit(self.cycle.resume, 'race')
            slow.result(timeout=3)
            release_writer.set()
            writer.result(timeout=3)
        self.assertEqual(self.cycle.store.get('race')['status'], 'evm_pending')


if __name__ == '__main__':
    unittest.main()
