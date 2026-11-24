"""Behavioral tests use a controlled venue; SDK signing stays outside unit tests."""
import importlib
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


class TradingTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(Path(__file__).with_name('trading.py').exists(), 'trading module must be implemented')
        self.mod = importlib.import_module('trading')
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'operations.sqlite'
        self.calls = []
        self.barrier = None
        self.fail_submit = False
        self.fail_claim = False
        owner = self

        class Venue:
            scope = 'aleo:testnet:account-a'

            def submit(self, native):
                owner.calls.append(('submit', native['amount']))
                if owner.barrier:
                    owner.barrier.wait(timeout=3)
                if owner.fail_submit:
                    raise TimeoutError('response lost')
                return {'transaction_id': 'tx-' + native['amount'], 'swap_id': native['amount']}

            def ready(self, handle):
                return True

            def claim(self, handle):
                owner.calls.append(('claim', handle['swap_id']))
                if owner.fail_claim:
                    raise TimeoutError('claim response lost')
                return {'transaction_id': 'claim-' + handle['swap_id'], 'amount_out': '120', 'amount_remaining': '0'}

        self.venue = Venue()
        self.trader = self.mod.Trading(self.venue, self.path, max_in_flight=2, execution_enabled=True)

    def offer(self, amount='1', age=0):
        return self.mod.Offer(self.venue.scope, {'amount': amount}, time.time() - age, 30)

    def test_distinct_requests_submit_together_and_keep_independent_results(self):
        self.barrier = threading.Barrier(2)
        result = self.trader.execute_many([('first', self.offer('1')), ('second', self.offer('2'))])
        self.assertEqual([row['status'] for row in result], ['complete', 'complete'])
        self.assertEqual({row['handle']['swap_id'] for row in result}, {'1', '2'})

    def test_duplicate_and_restart_do_not_submit_again(self):
        self.trader.execute('one', self.offer())
        restarted = self.mod.Trading(self.venue, self.path, execution_enabled=True)
        self.assertEqual(restarted.execute('one', self.offer())['status'], 'complete')
        self.assertEqual(len(self.calls), 2)
        with self.assertRaisesRegex(ValueError, 'intent'):
            restarted.execute('one', self.offer('2'))

    def test_lost_submission_response_is_retained_and_not_retried(self):
        self.fail_submit = True
        self.assertEqual(self.trader.execute('one', self.offer())['status'], 'submission_unknown')
        self.fail_submit = False
        self.assertEqual(self.trader.execute('one', self.offer())['status'], 'submission_unknown')
        self.assertEqual(len(self.calls), 1)

    def test_restart_can_claim_known_submission(self):
        self.trader.submit('one', self.offer())
        restarted = self.mod.Trading(self.venue, self.path, execution_enabled=True)
        self.assertEqual(restarted.claim('one')['status'], 'complete')
        self.assertEqual(len(self.calls), 2)

    def test_lost_claim_response_never_creates_a_second_claim(self):
        self.fail_claim = True
        self.assertEqual(self.trader.execute('one', self.offer())['status'], 'claim_unknown')
        self.fail_claim = False
        self.assertEqual(self.trader.claim('one')['status'], 'claim_unknown')
        self.assertEqual(len(self.calls), 2)

    def test_duplicate_concurrent_call_has_one_writer(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(lambda _: self.trader.execute('same', self.offer()), range(2)))
        self.assertEqual(sum(kind == 'submit' for kind, _ in self.calls), 1)
        self.assertEqual(sum(kind == 'claim' for kind, _ in self.calls), 1)

    def test_separate_processes_keep_one_writer_and_restart_does_not_retry(self):
        worker = '''
import sys, time
from operations import OperationStore
from trading import Offer, Trading
class Venue:
    scope = 'aleo:testnet:account-a'
    def submit(self, native):
        with open(sys.argv[1] + '.calls', 'a') as calls:
            calls.write('submitted\\n')
        time.sleep(0.1)
        raise TimeoutError('response lost after broadcast')
    def ready(self, handle):
        raise AssertionError('unknown submission cannot be claimed')
trader = Trading(Venue(), sys.argv[1], execution_enabled=True)
trader.execute('same', Offer(Venue.scope, {'amount': '1'}, time.time(), 30))
'''
        # Start with a new database: startup and the first request both race.
        path = self.path.parent / 'processes.sqlite'
        processes = [subprocess.Popen([sys.executable, '-c', worker, str(path)],
            cwd=Path(__file__).parent, stdout=subprocess.PIPE, stderr=subprocess.PIPE) for _ in range(6)]
        for process in processes:
            stdout, stderr = process.communicate(timeout=15)
            self.assertEqual(process.returncode, 0, stderr.decode())
        store = importlib.import_module('operations').OperationStore(path)
        self.assertEqual(store.get('same')['status'], 'submission_unknown')
        # The restart reads the original unknown operation without another write.
        restarted = subprocess.run([sys.executable, '-c', worker, str(path)],
            cwd=Path(__file__).parent, capture_output=True, timeout=15)
        self.assertEqual(restarted.returncode, 0, restarted.stderr.decode())
        self.assertEqual(Path(str(path) + '.calls').read_text().splitlines(), ['submitted'])

    def test_read_only_wrong_scope_and_stale_offers_do_not_submit(self):
        read_only = self.mod.Trading(self.venue, self.path)
        with self.assertRaisesRegex(PermissionError, 'execution'):
            read_only.execute('no', self.offer())
        with self.assertRaisesRegex(ValueError, 'expired'):
            self.trader.execute('old', self.offer(age=31))
        offer = self.mod.Offer('wrong-account', {}, time.time(), 30)
        with self.assertRaisesRegex(ValueError, 'scope'):
            self.trader.execute('wrong', offer)
        self.assertEqual(self.calls, [])

    def test_unknown_operation_occupies_capacity_until_reconciled(self):
        self.fail_submit = True
        self.trader.execute('one', self.offer())
        self.trader.execute('two', self.offer('2'))
        with self.assertRaisesRegex(RuntimeError, 'capacity'):
            self.trader.execute('three', self.offer('3'))
        self.assertEqual(len(self.calls), 2)

    def test_read_failure_after_submission_returns_the_saved_operation(self):
        def unavailable(handle):
            raise TimeoutError('mapping unavailable')
        self.venue.ready = unavailable
        result = self.trader.execute_many([('a', self.offer())])[0]
        self.assertEqual(result['status'], 'submitted')
        self.assertEqual(result['handle']['transaction_id'], 'tx-1')


if __name__ == '__main__':
    unittest.main()
