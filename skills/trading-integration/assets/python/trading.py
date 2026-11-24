"""Reusable submit/claim workflow with durable request deduplication."""
from __future__ import annotations

import math
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from operations import OperationStore


@dataclass(frozen=True)
class Offer:
    scope: str
    native: dict
    quoted_at: float
    max_age: float

    def validate(self, scope):
        if scope != self.scope:
            raise ValueError('Quote scope does not match the account and network')
        age = time.time() - self.quoted_at
        if not all(math.isfinite(x) for x in (age, self.max_age)) or not 0 < self.max_age <= 60 or age < 0 or age >= self.max_age:
            raise ValueError('Quote expired or has an invalid timestamp')


class Trading:
    """One account uses the same operation store and SDK reservation/identity stores.

    A submitting/claiming checkpoint left by a stopped process is unresolved.
    Repeated execute calls never replace it. Only a known submitted handle can
    continue to its first claim; ambiguous writes require SDK/chain reconciliation.
    """
    def __init__(self, venue, state_path, *, max_in_flight=1, execution_enabled=False):
        if type(max_in_flight) is not int or not 1 <= max_in_flight <= 32:
            raise ValueError('max_in_flight must be an integer from 1 to 32')
        self.venue = venue
        self.store = OperationStore(state_path)
        self.max_in_flight = max_in_flight
        self.execution_enabled = execution_enabled

    def status(self, operation_id):
        row = self.store.get(operation_id)
        if row and row['scope'] != self.venue.scope:
            raise ValueError('Operation scope does not match this account')
        return row

    def require_execution(self):
        if not self.execution_enabled:
            raise PermissionError('Enable execution only after account, network, amounts and limits are authorized')

    def submit(self, operation_id, offer):
        self.require_execution()
        existing = self.status(operation_id)
        # Completed or uncertain requests remain inspectable after their quote ages out.
        if existing is None:
            offer.validate(self.venue.scope)
        row, created = self.store.begin(operation_id, offer.scope, offer.native, capacity=self.max_in_flight)
        if not created:
            return row
        try:
            # The SDK reserves records and identities and persists the proved transaction.
            handle = self.venue.submit(offer.native)
            self.store.transition(operation_id, 'submitting', 'submitted', handle=handle)
        except Exception as error:
            self.store.transition(operation_id, 'submitting', 'submission_unknown', error_type=type(error).__name__)
        return self.status(operation_id)

    def claim(self, operation_id):
        self.require_execution()
        row = self.status(operation_id)
        if row is None:
            raise KeyError(operation_id)
        if row['status'] != 'submitted':
            return row
        # Polling readiness is read-only and cannot cause a duplicate claim.
        if not self.venue.ready(row['handle']):
            return row
        if not self.store.transition(operation_id, 'submitted', 'claiming'):
            return self.status(operation_id)
        try:
            result = self.venue.claim(row['handle'])
            self.store.transition(operation_id, 'claiming', 'complete', result=result)
        except Exception as error:
            self.store.transition(operation_id, 'claiming', 'claim_unknown', error_type=type(error).__name__)
        return self.status(operation_id)

    def execute(self, operation_id, offer):
        row = self.submit(operation_id, offer)
        return self.claim(operation_id) if row['status'] == 'submitted' else row

    def execute_many(self, requests):
        """Different quotes run independently; every request retains its own outcome."""
        def run(request):
            try:
                return self.execute(*request)
            except Exception as error:
                try:
                    saved = self.status(request[0])
                except ValueError:
                    saved = None
                return {**(saved or {'id': request[0], 'status': 'not_started'}), 'error_type': type(error).__name__}
        with ThreadPoolExecutor(max_workers=self.max_in_flight) as pool:
            return list(pool.map(run, requests))
