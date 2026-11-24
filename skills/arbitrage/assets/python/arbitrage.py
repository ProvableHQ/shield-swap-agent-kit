"""Exact arithmetic for a prefunded Shield sell / Uniswap buy cycle."""
from __future__ import annotations

import math
import re
import time


def atoms(value, decimals):
    """Convert decimal text without floating-point arithmetic or implicit rounding."""
    if type(decimals) is not int or not 0 <= decimals <= 38:
        raise ValueError('Invalid token decimals')
    if not isinstance(value, str) or not re.fullmatch(r'\d+(?:\.\d+)?', value):
        raise ValueError('Amounts must be nonnegative decimal strings')
    whole, _, fraction = value.partition('.')
    if len(fraction) > decimals:
        raise ValueError('Amount exceeds token precision')
    return int(whole) * 10**decimals + int(fraction.ljust(decimals, '0') or '0')


def evaluate(*, base_amount, base_decimals, shield_out_decimals, evm_quote_decimals,
             shield_min_out, evm_max_in, costs, min_profit, max_age,
             shield_quoted_at, evm_quoted_at, equivalence_confirmed):
    """Use conservative quote bounds; costs include fees not already in quotes."""
    decimals = max(shield_out_decimals, evm_quote_decimals)
    amount = atoms(base_amount, base_decimals)
    proceeds = atoms(shield_min_out, shield_out_decimals) * 10**(decimals - shield_out_decimals)
    if type(evm_max_in) is not int or evm_max_in <= 0 or amount <= 0:
        raise ValueError('Trade amounts must be positive integers')
    cost = evm_max_in * 10**(decimals - evm_quote_decimals)
    extra = atoms(costs, decimals)
    threshold = atoms(min_profit, decimals)
    ages = [time.time() - shield_quoted_at, time.time() - evm_quoted_at]
    fresh = math.isfinite(max_age) and 0 < max_age <= 60 and all(math.isfinite(age) and 0 <= age < max_age for age in ages)
    net = proceeds - cost - extra
    return {'eligible': bool(equivalence_confirmed is True and fresh and net > 0 and net >= threshold),
            'base_atoms': amount, 'net_quote_atoms': net, 'quote_decimals': decimals,
            'fresh': fresh, 'equivalence_confirmed': equivalence_confirmed is True}
