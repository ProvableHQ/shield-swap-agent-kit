"""Shield Swap adapter. Quotes and handles retain the published SDK's shapes."""
from __future__ import annotations

import json
import time
from dataclasses import asdict
from pathlib import Path

from trading import Offer


class ShieldVenue:
    def __init__(self, dex, *, address, network, aleo=None):
        if network not in ('mainnet', 'testnet'):
            raise ValueError('Choose mainnet or testnet explicitly')
        if dex.journal is None:
            raise ValueError('Configure a durable SDK identity journal before using this adapter')
        self.dex, self.aleo = dex, aleo
        self.address, self.network = address, network
        self.scope = f'aleo:{network}:{address}'

    def quote(self, token_in, token_out, amount, *, slippage_bps, max_age):
        started = time.time()
        native = self.dex.quote(token_in=token_in, token_out=token_out, amount_in=amount, slippage_bps=slippage_bps)
        if native.network != self.network:
            raise ValueError('Quote network does not match this trading account')
        offer = Offer(self.scope, asdict(native), started, max_age)
        offer.validate(self.scope)
        return offer

    def check_session(self):
        from aleo.inventory import JsonFileRecordInventoryStore, SqliteRecordInventoryStore
        if self.aleo is None or self.aleo.network_name != self.network or str(self.aleo.default_account.address) != self.address:
            raise ValueError('The SDK account or network changed')
        config = self.aleo.record_management
        if config is None or not config.enabled or not isinstance(config.store, (SqliteRecordInventoryStore, JsonFileRecordInventoryStore)):
            raise ValueError('Trading requires enabled SDK record management with a durable store')

    def submit(self, native):
        from aleo_shield_swap.types import SwapQuote, SwapQuoteHop
        self.check_session()
        data = dict(native)
        data['hops'] = tuple(SwapQuoteHop(**hop) for hop in data['hops'])
        # Preserve exact route, minimum output and protocol revision.
        handle = self.dex.swap(SwapQuote(**data)).delegate(wait=False)
        return json.loads(handle.to_json())

    def ready(self, handle):
        from aleo_shield_swap.errors import SwapOutputNotFinalizedError
        if not handle.get('swap_id'):
            return False
        try:
            self.dex.get_swap_output(handle['swap_id'])
            return True
        except SwapOutputNotFinalizedError:
            return False

    def claim(self, handle):
        from aleo_shield_swap.types import SwapHandle
        self.check_session()
        result = self.dex.claim_swap_output(SwapHandle.from_json(json.dumps(handle))).delegate(wait=True)
        return {key: str(value) for key, value in asdict(result).items()}

    def inventory(self, token):
        """SDK inventory excludes held records; aggregate private balance alone does not."""
        from aleo.inventory import RecordAsset
        info = self.dex.api.get_token(token)
        return self.aleo.inventory.get_record_inventory(RecordAsset(info.underlying_program))


def open_session(*, private_key, address, network, state_root, endpoint='https://edge.provable.com/api'):
    """Use an existing key in memory, authenticate, and reuse durable SDK journals.

    This signs an API challenge. Scanner registration belongs to account setup.
    No faucet, account generation, inventory reshaping, or trade occurs here.
    """
    from aleo import Aleo, HTTPProvider
    from aleo.inventory import RecordManagementConfig, SqliteRecordInventoryStore
    from aleo_shield_swap import Journal, ShieldSwap
    import aleo

    if network not in ('mainnet', 'testnet'):
        raise ValueError('Choose mainnet or testnet explicitly')
    key = getattr(aleo, network).PrivateKey.from_string(private_key)
    if str(key.address) != address:
        raise ValueError('The selected account does not match the expected address')
    home = Path(state_root).resolve() / network / address
    home.mkdir(parents=True, exist_ok=True, mode=0o700)
    if home.stat().st_mode & 0o077:
        raise PermissionError('The account state directory must have mode 0700')
    inventory_store = SqliteRecordInventoryStore(home / 'inventory.sqlite')
    client = Aleo(HTTPProvider(endpoint, network=network), record_management=RecordManagementConfig(
        enabled=True, store=inventory_store, chain_id=f'aleo:{network}'))
    client.default_account = client.account.from_private_key(key)
    client.records.scanner.set_account(client.default_account)
    client.records.scanner.set_decrypt_enabled(True)
    client.records.scanner.set_auto_re_register(False)
    dex = ShieldSwap(client)
    dex.journal = Journal(home / 'swaps.jsonl')
    dex.api.authenticate(address, lambda message: str(key.sign(message.encode())))
    return ShieldVenue(dex, address=address, network=network, aleo=client)
