"""Persistent local bridge wallets for Python. Secrets stay in the OS credential store."""

import argparse
import json
import os
from pathlib import Path
import re
import stat
import sys
import uuid

SERVICE = "shield-swap-funding"
CHAINS = {"ethereum", "base", "arbitrum", "arc", "solana"}


def _configuration(chain, asset, recipient, purpose):
    if (chain not in CHAINS or purpose not in {"deposit", "reusable"}
            or not re.fullmatch(r"[a-z0-9-]+", asset or "")
            or not re.fullmatch(r"aleo1[023456789acdefghjklmnpqrstuvwxyz]{58}", recipient or "")):
        raise ValueError("INVALID_WALLET_CONFIGURATION")


def _private_path(path):
    info = Path(path).lstat()
    if stat.S_ISLNK(info.st_mode) or (os.name != "nt" and info.st_mode & 0o077):
        raise ValueError("INSECURE_WALLET_PATH")


def _credential_store():
    # Select persistent OS storage explicitly; never accept a plaintext fallback.
    if sys.platform == "darwin":
        from keyring.backends.macOS import Keyring
    elif sys.platform == "win32":
        from keyring.backends.Windows import WinVaultKeyring as Keyring
    elif sys.platform.startswith("linux"):
        from keyring.backends.SecretService import Keyring
    else:
        raise RuntimeError("UNSUPPORTED_CREDENTIAL_STORE")
    return Keyring()


def _generate(family):
    if family == "evm":
        from eth_account import Account
        return "0x" + bytes(Account.create().key).hex()
    from solders.keypair import Keypair
    return json.dumps(list(bytes(Keypair())))


def _derive(family, secret):
    if family == "evm":
        from eth_account import Account
        return Account.from_key(secret).address
    from solders.keypair import Keypair
    values = json.loads(secret)
    if not isinstance(values, list) or len(values) != 64 or any(type(v) is not int or not 0 <= v <= 255 for v in values):
        raise ValueError("INVALID_SOLANA_KEY")
    return str(Keypair.from_bytes(bytes(values)).pubkey())


def _write_new_json(path, value):
    path = Path(path)
    temporary = path.parent / f".manifest-{uuid.uuid4()}.tmp"
    try:
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as output:
            json.dump(value, output, indent=2)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.link(temporary, path)  # Publish atomically without replacing a saved identity.
        if os.name != "nt":
            fd = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
    finally:
        temporary.unlink(missing_ok=True)


def _metadata(reservation, address):
    return {"version": 1, "service": SERVICE, "credentialId": reservation["credentialId"],
            "family": reservation["family"], "address": address, "sourceChain": reservation["chain"],
            "sourceAsset": reservation["asset"], "recipient": reservation["recipient"],
            "environment": "mainnet", "purpose": reservation["purpose"], "storage": "os-keyring"}


def _identity(data):
    if (data.get("version") != 1 or data.get("service") != SERVICE
            or data.get("family") not in {"evm", "solana"}
            or not re.fullmatch(r"[a-f0-9-]{36}", data.get("credentialId", ""))):
        raise ValueError("INVALID_WALLET_METADATA")


def create_local_wallet(directory, chain, asset, recipient, purpose="deposit", *, store=None, generate=None, derive=None):
    _configuration(chain, asset, recipient, purpose)
    directory = Path(directory).expanduser()
    _private_path(directory.parent)
    directory.mkdir(mode=0o700)  # Reserve before generating; existing state always stops creation.
    reservation = {"version": 1, "service": SERVICE, "credentialId": str(uuid.uuid4()),
                   "family": "solana" if chain == "solana" else "evm",
                   "chain": chain, "asset": asset, "recipient": recipient, "purpose": purpose}
    _write_new_json(directory / "reservation.json", reservation)
    store = store if store is not None else _credential_store()
    credential_id = reservation["credentialId"]
    if store.get_password(SERVICE, credential_id) is not None:
        raise ValueError("CREDENTIAL_ALREADY_EXISTS")
    secret = (generate or _generate)(reservation["family"])
    address = (derive or _derive)(reservation["family"], secret)
    store.set_password(SERVICE, credential_id, secret)
    if store.get_password(SERVICE, credential_id) != secret:
        raise ValueError("CREDENTIAL_VERIFICATION_FAILED")
    metadata = _metadata(reservation, address)
    _write_new_json(directory / "wallet.json", metadata)
    return metadata


def load_local_wallet(directory, *, store=None, derive=None):
    directory = Path(directory).expanduser()
    for path in (directory, directory / "wallet.json"):
        _private_path(path)
    metadata = json.loads((directory / "wallet.json").read_text())
    _identity(metadata)
    _configuration(metadata.get("sourceChain"), metadata.get("sourceAsset"), metadata.get("recipient"), metadata.get("purpose"))
    if metadata["family"] != ("solana" if metadata["sourceChain"] == "solana" else "evm"):
        raise ValueError("WALLET_CHAIN_MISMATCH")
    store = store if store is not None else _credential_store()
    secret = store.get_password(SERVICE, metadata["credentialId"])
    if not secret:
        raise RuntimeError("CREDENTIAL_UNAVAILABLE")
    if (derive or _derive)(metadata["family"], secret) != metadata.get("address"):
        raise ValueError("WALLET_ADDRESS_MISMATCH")
    return metadata, secret


def recover_local_wallet(directory, *, store=None, derive=None):
    directory = Path(directory).expanduser()
    # Recover only a missing manifest, not a damaged identity or missing credential.
    if (directory / "wallet.json").exists() or (directory / "wallet.json").is_symlink():
        return load_local_wallet(directory, store=store, derive=derive)[0]
    for path in (directory, directory / "reservation.json"):
        _private_path(path)
    reservation = json.loads((directory / "reservation.json").read_text())
    _identity(reservation)
    _configuration(reservation.get("chain"), reservation.get("asset"), reservation.get("recipient"), reservation.get("purpose"))
    if reservation["family"] != ("solana" if reservation["chain"] == "solana" else "evm"):
        raise ValueError("WALLET_CHAIN_MISMATCH")
    store = store if store is not None else _credential_store()
    secret = store.get_password(SERVICE, reservation["credentialId"])
    if not secret:
        raise RuntimeError("CREDENTIAL_UNAVAILABLE")
    metadata = _metadata(reservation, (derive or _derive)(reservation["family"], secret))
    _write_new_json(directory / "wallet.json", metadata)
    return metadata


def load_local_client(directory, chain, rpc_url):
    metadata, secret = load_local_wallet(directory)
    if chain not in CHAINS or (chain == "solana") != (metadata["family"] == "solana"):
        raise ValueError("WALLET_CHAIN_MISMATCH")
    from aleo_bridge import Ethereum, Solana
    return Solana(rpc_url, private_key=secret) if chain == "solana" else Ethereum(rpc_url, private_key=secret)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["create", "check", "recover", "backup"])
    parser.add_argument("--state-dir", required=True)
    for name in ("chain", "asset", "recipient", "purpose"):
        parser.add_argument(f"--{name}")
    args = parser.parse_args()
    try:
        if args.command == "create":
            result = create_local_wallet(args.state_dir, args.chain, args.asset, args.recipient, args.purpose or "deposit")
        elif args.command == "recover":
            result = recover_local_wallet(args.state_dir)
        elif args.command == "backup":
            if not sys.stdin.isatty() or not sys.stdout.isatty():
                raise RuntimeError("BACKUP_REQUIRES_YOUR_OWN_TERMINAL")
            print(load_local_wallet(args.state_dir)[1])
            return
        else:
            result = load_local_wallet(args.state_dir)[0]
        print(json.dumps(result, indent=2))
    except Exception:
        print("Wallet operation stopped. Check the command, private state directory, and unlocked OS credential store. "
              "Reuse existing state; do not replace a wallet after an error.", file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
