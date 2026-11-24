"""Callable examples for a consumer's scheduler; importing this file performs no I/O."""
from __future__ import annotations


def discover(venue):
    """Read the registry and pool list, without opening a signing session."""
    tokens = venue.dex.api.get_tokens()
    pools = venue.dex.api.get_pools()
    return {
        'tokens': [{'id': t.address, 'symbol': t.symbol, 'decimals': t.decimals,
                    'amm_program': t.amm_token_program, 'record_program': t.underlying_program or t.amm_token_program}
                   for t in tokens],
        'pools': [{'key': p.key, 'token0': p.token0, 'token1': p.token1, 'enabled': p.enabled} for p in pools],
    }


def inventory_summary(venue, token):
    """Return amounts, never decrypted record contents."""
    snapshot = venue.inventory(token)
    return {'available_base_units': str(snapshot.balance),
            'available_record_amounts': [str(r.amount) for r in snapshot.available],
            'reserved_records': len(snapshot.reserved)}


def plan_inventory(venue, token, *, count, minimum_base_units, max_transactions):
    from aleo.inventory import InventoryTarget
    return venue.aleo.inventory.plan_record_inventory(venue.record_asset(token), InventoryTarget(
        records=count, min_record_amount=minimum_base_units, distribution='preserve'),
        max_transactions=max_transactions)


def execute_inventory_plan(venue, plan, *, max_fee_microcredits):
    """A separate authorized write. Execute the reviewed plan, without replanning."""
    venue.check_session()
    return venue.aleo.inventory.rebalance_record_inventory(
        plan, max_fee_microcredits=max_fee_microcredits, timeout=120.0, poll_interval=2.0)


def continue_trade(trading, request_id):
    """Call from a bounded scheduler. Never obtain a new quote or submit a swap."""
    row = trading.status(request_id)
    if row is None:
        raise KeyError(request_id)
    if row['status'] == 'submitted':
        row = trading.claim(request_id)
    return progress(row)


def progress(row):
    """An application-facing summary; raw operation rows contain claim secrets."""
    result = row.get('result') or {}
    handle = row.get('handle') or {}
    return {'id': row['id'], 'status': row['status'],
            'request_transaction_id': handle.get('transaction_id'),
            'claim_transaction_id': result.get('transaction_id'),
            'output_base_units': result.get('amount_out'),
            'refund_base_units': result.get('amount_remaining'),
            'error_type': row.get('error_type')}
