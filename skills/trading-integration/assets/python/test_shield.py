"""SDK boundary tests, run with the published shield-swap-sdk installed."""
import importlib.util
import tempfile
import time
import unittest
from dataclasses import asdict
from pathlib import Path
from types import SimpleNamespace


@unittest.skipUnless(importlib.util.find_spec('aleo_shield_swap'), 'installed-package checks need shield-swap-sdk')
class ShieldTests(unittest.TestCase):
    def test_session_factory_works_with_the_published_sdk_without_creating_an_account_file(self):
        from shield import open_session
        from aleo import testnet
        from unittest.mock import patch
        key = testnet.PrivateKey.random()
        with tempfile.TemporaryDirectory() as directory:
            with patch('aleo_shield_swap.api.ApiClient.authenticate'):
                venue = open_session(private_key=str(key), address=str(key.address), network='testnet', state_root=Path(directory))
            venue.check_session()
            response = SimpleNamespace(json=lambda: {'synced': True})
            with patch.object(venue.aleo.records.scanner, '_post_json', return_value=response):
                # A newly constructed scanner must retain the account locally,
                # without requiring another remote registration.
                venue.aleo.records.status()
            self.assertFalse((Path(directory) / 'account.json').exists())
            venue.aleo.record_management.store.close()

    def test_quote_is_preserved_with_native_units_route_and_protocol_revision(self):
        self.assertTrue(Path(__file__).with_name('shield.py').exists())
        from shield import ShieldVenue
        from aleo_shield_swap.types import SwapQuote, SwapQuoteHop
        native = SwapQuote('0.001', '3', '2.98', (SwapQuoteHop('1field', '2field', '3field', True),),
                           '2field', '3field', 'testnet', 'shield_swap.aleo', 50, 18, 6, 2)
        dex = SimpleNamespace(journal=object(), quote=lambda **kwargs: native)
        venue = ShieldVenue(dex, address='aleo1fixture', network='testnet')
        offer = venue.quote('ETH', 'USDCx', '0.001', slippage_bps=50, max_age=20)
        self.assertEqual(offer.native, asdict(native))
        self.assertEqual(offer.max_age, 20)
        self.assertLessEqual(offer.quoted_at, time.time())

    def test_missing_durable_identity_journal_is_rejected(self):
        self.assertTrue(Path(__file__).with_name('shield.py').exists())
        from shield import ShieldVenue
        with self.assertRaisesRegex(ValueError, 'journal'):
            ShieldVenue(SimpleNamespace(journal=None), address='aleo1fixture', network='testnet')


if __name__ == '__main__':
    unittest.main()
