"""A durable two-venue cycle. Stop with explicit exposure when either leg is unresolved."""
from operations import OperationStore
from trading import Offer


class Cycle:
    def __init__(self, shield, uniswap, state_path, *, refresh_buy):
        self.shield, self.uniswap = shield, uniswap
        self.store = OperationStore(state_path)
        self.refresh_buy = refresh_buy
        self.scope = f'{shield.venue.scope}|{uniswap.scope}'

    def execute(self, cycle_id, plan):
        if not self.shield.execution_enabled or not self.uniswap.execution_enabled:
            raise PermissionError('Both venues must be authorized for execution')
        if plan['scope'] != self.scope or not plan['decision']['eligible']:
            raise ValueError('The plan is ineligible or belongs to different accounts')
        row, created = self.store.begin(cycle_id, self.scope, plan, capacity=1)
        if not created:
            return row
        self.store.transition(cycle_id, 'submitting', 'shield_starting')
        try:
            result = self.shield.execute(cycle_id + ':shield', Offer(**plan['shield']))
        except Exception as error:
            self.store.transition(cycle_id, 'shield_starting', 'needs_review', error_type=type(error).__name__)
            return self.store.get(cycle_id)
        self.store.transition(cycle_id, 'shield_starting', 'shield_pending', shield_operation=result['status'])
        return self.resume(cycle_id)

    def resume(self, cycle_id):
        """Resume only known child operations; a missing response never launches a new leg."""
        row = self.store.get(cycle_id)
        if not row or row['scope'] != self.scope:
            raise ValueError('Unknown cycle or wrong accounts')
        plan = row['intent']
        if row['status'] in ('submitting', 'shield_starting'):
            # A crash might precede or follow the child's durable registration.
            child = self.shield.status(cycle_id + ':shield')
            if not child:
                return row
            self.store.transition(cycle_id, row['status'], 'shield_pending')
            row = self.store.get(cycle_id)
        if row['status'] == 'shield_pending':
            child = self.shield.status(cycle_id + ':shield')
            if child and child['status'] == 'submitted':
                child = self.shield.claim(cycle_id + ':shield')
            if not child or child['status'] != 'complete':
                return row
            result = child['result']
            if int(result['amount_remaining']) != 0 or int(result['amount_out']) <= 0:
                self.store.transition(cycle_id, 'shield_pending', 'unmatched', reason='partial_fill_or_refund', shield_result=result)
                return self.store.get(cycle_id)
            self.store.transition(cycle_id, 'shield_pending', 'shield_complete', shield_result=result)
            row = self.store.get(cycle_id)
        if row['status'] == 'shield_complete':
            if not self.uniswap.execution_enabled:
                raise PermissionError('Second-leg execution is not enabled')
            owns_submission = False
            try:
                offer, eligible = self.refresh_buy(plan, row['shield_result'])
                if not eligible:
                    self.store.transition(cycle_id, 'shield_complete', 'unmatched', reason='edge_changed')
                    return self.store.get(cycle_id)
                if not self.store.transition(cycle_id, 'shield_complete', 'evm_starting'):
                    return self.store.get(cycle_id)
                owns_submission = True
                result = self.uniswap.execute(cycle_id + ':evm', offer,
                    max_age=plan['policy']['max_age'], gas_budget_wei=plan['policy']['gas_budget_wei'])
                self.store.transition(cycle_id, 'evm_starting', 'evm_pending', evm_operation=result['status'])
            except Exception as error:
                # A competing refresh may fail while another caller owns the write.
                # Only this caller's phase may be advanced; never overwrite it.
                self.store.transition(cycle_id, 'evm_starting' if owns_submission else 'shield_complete',
                    'evm_pending' if owns_submission else 'unmatched', reason='second_leg_error', error_type=type(error).__name__)
                return self.store.get(cycle_id)
            row = self.store.get(cycle_id)
        if row['status'] in ('evm_pending', 'evm_starting'):
            try:
                result = self.uniswap.status(cycle_id + ':evm', confirmations=plan['policy']['confirmations'])
            except Exception:
                return row
            if result['status'] in ('complete', 'failed'):
                status = 'complete' if result['status'] == 'complete' else 'unmatched'
                self.store.transition(cycle_id, row['status'], status, evm_transaction=result.get('tx_hash'), reason=None if status == 'complete' else 'second_leg_failed')
        return self.store.get(cycle_id)
