import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import local_wallet as wallet


class Store:
    def __init__(self):
        self.values = {}

    def get_password(self, service, name):
        return self.values.get((service, name))

    def set_password(self, service, name, secret):
        self.values[service, name] = secret


class LocalWalletTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name) / "wallet"
        self.store = Store()
        self.options = dict(store=self.store, generate=lambda family: "fixture-secret", derive=self.derive)

    @staticmethod
    def derive(family, secret):
        return family + "-fixture-address" if secret == "fixture-secret" else "different-address"

    def create(self):
        return wallet.create_local_wallet(self.directory, "ethereum", "eth", "aleo1" + "a" * 58, **self.options)

    def test_reload_preserves_identity_and_files_contain_no_secret(self):
        metadata = self.create()
        reopened_store = Store()
        reopened_store.values = self.store.values.copy()
        loaded, secret = wallet.load_local_wallet(self.directory, store=reopened_store, derive=self.derive)
        self.assertEqual(loaded, metadata)
        self.assertEqual(secret, "fixture-secret")
        for file in self.directory.iterdir():
            self.assertNotIn("fixture-secret", file.read_text())
            if os.name != "nt":
                self.assertEqual(file.stat().st_mode & 0o777, 0o600)
        with self.assertRaises(FileExistsError):
            self.create()

    def test_missing_or_wrong_credentials_do_not_regenerate(self):
        metadata = self.create()
        self.store.values.clear()
        with self.assertRaisesRegex(RuntimeError, "CREDENTIAL_UNAVAILABLE"):
            wallet.recover_local_wallet(self.directory, store=self.store, derive=self.derive)
        self.store.set_password(wallet.SERVICE, metadata["credentialId"], "wrong-secret")
        with self.assertRaisesRegex(ValueError, "WALLET_ADDRESS_MISMATCH"):
            wallet.load_local_wallet(self.directory, store=self.store, derive=self.derive)
        self.assertEqual(json.loads((self.directory / "wallet.json").read_text()), metadata)

    def test_interrupted_creation_recovers_original_credential(self):
        original = wallet._write_new_json

        def interrupted(path, value):
            if path.name == "wallet.json":
                raise OSError("interrupted")
            original(path, value)

        with patch.object(wallet, "_write_new_json", interrupted), self.assertRaises(OSError):
            self.create()
        reservation = json.loads((self.directory / "reservation.json").read_text())
        restored = wallet.recover_local_wallet(self.directory, store=self.store, derive=self.derive)
        self.assertEqual(restored["credentialId"], reservation["credentialId"])
        self.assertEqual(restored["address"], "evm-fixture-address")
        self.assertEqual(len(self.store.values), 1)

    def test_unavailable_store_leaves_reservation_and_no_deposit_address(self):
        with patch.object(wallet, "_credential_store", side_effect=RuntimeError("locked")), self.assertRaises(RuntimeError):
            wallet.create_local_wallet(self.directory, "ethereum", "eth", "aleo1" + "a" * 58)
        self.assertTrue((self.directory / "reservation.json").exists())
        self.assertFalse((self.directory / "wallet.json").exists())
        with self.assertRaisesRegex(RuntimeError, "CREDENTIAL_UNAVAILABLE"):
            wallet.recover_local_wallet(self.directory, store=self.store, derive=self.derive)

    @unittest.skipIf(os.name == "nt", "POSIX permissions")
    def test_insecure_or_symlink_manifest_is_rejected(self):
        self.create()
        path = self.directory / "wallet.json"
        path.chmod(0o644)
        with self.assertRaisesRegex(ValueError, "INSECURE_WALLET_PATH"):
            wallet.load_local_wallet(self.directory, store=self.store, derive=self.derive)
        path.chmod(0o600)
        target = self.directory / "saved.json"
        path.rename(target)
        path.symlink_to(target)
        with self.assertRaisesRegex(ValueError, "INSECURE_WALLET_PATH"):
            wallet.recover_local_wallet(self.directory, store=self.store, derive=self.derive)

    def test_import_and_help_need_no_sdk_credentials_or_wallet_creation(self):
        result = subprocess.run([sys.executable, "-S", str(Path(wallet.__file__)), "--help"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--state-dir", result.stdout)
        self.assertFalse(self.directory.exists())

    def test_backup_refuses_captured_output(self):
        result = subprocess.run([sys.executable, str(Path(wallet.__file__)), "backup", "--state-dir", str(self.directory)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, "")
        self.assertFalse(self.directory.exists())


if __name__ == "__main__":
    unittest.main()
