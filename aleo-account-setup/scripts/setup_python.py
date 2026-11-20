"""Authenticate and check private balances without funding or trading."""
from __future__ import annotations

import argparse
from getpass import getpass
import json
from pathlib import Path
import re
import time

from aleo import Aleo, HTTPProvider, keystore
from aleo_shield_swap import Journal, Profile, ShieldSwap

ASSETS = ("BAT", "ZEC", "USDG", "USDCX", "ETH", "wBTC", "USDT", "SOL")


class ScanPendingError(TimeoutError):
    """The scanner accepted registration but has not caught up yet."""


def validate_address(address: str) -> None:
    if not re.fullmatch(r"aleo1[023456789acdefghjklmnpqrstuvwxyz]{58}", address):
        raise ValueError("Supply the verified public Aleo address")


def format_amount(raw: int, decimals: int) -> str:
    if raw < 0 or not isinstance(decimals, int) or not 0 <= decimals <= 38:
        raise ValueError("Invalid token amount or decimals")
    if decimals == 0:
        return str(raw)
    digits = str(raw).zfill(decimals + 1)
    fraction = digits[-decimals:].rstrip("0")
    return digits[:-decimals] + ("." + fraction if fraction else "")


def open_session(name: str, address: str, network: str, state_root: Path, *, prompt: bool = False):
    """Retain this factory in a new application to reuse its profile and recovery journal."""
    validate_address(address)
    if not name or network not in ("mainnet", "testnet"):
        raise ValueError("Account name and network are required")
    password = None
    try:
        loaded = keystore.load(name=name, prompt=False)
    except keystore.KeystoreError as error:
        if error.code != "PASSWORD_REQUIRED" or not prompt:
            raise
        password = getpass("Account password: ")
        loaded = keystore.load(name=name, password=password, prompt=False)
    if loaded.address != address:
        raise ValueError("ADDRESS_MISMATCH")
    home = state_root.resolve() / network / address
    profile = Profile.load_or_create(home=home, network=network, account=name, password=password, create=False)
    if profile.address != address or profile.network != network:
        raise ValueError("PROFILE_MISMATCH")
    client = Aleo(HTTPProvider(profile.endpoint, network=network))
    client.default_account = client.account.from_private_key(loaded.private_key)
    dex = ShieldSwap(client)
    dex.profile = profile
    dex.journal = Journal(profile.journal_path, counters=profile.counters_path)
    # API authentication signs a challenge; it does not mint a durable API token.
    import aleo
    key = getattr(aleo, network).PrivateKey.from_string(loaded.private_key)
    dex.api.authenticate(address, lambda message: str(key.sign(message.encode())))
    return client, dex, profile


def check_private_balances(client, dex):
    registration = client.records.register(client.default_account, start=0)
    if registration.get("ok") is not True:
        raise RuntimeError("SCANNER_REGISTRATION_FAILED")
    deadline = time.monotonic() + 20
    while True:
        status = client.records.status()
        if status.get("ok") is not True:
            raise RuntimeError("SCANNER_STATUS_FAILED")
        if status.get("data", {}).get("synced") is True:
            break
        if time.monotonic() >= deadline:
            raise ScanPendingError("SCAN_PENDING")
        time.sleep(1)
    try:
        tokens = dex.api.get_tokens()
    except Exception:
        return [{"symbol": symbol, "status": "registry_unavailable"} for symbol in ASSETS]
    results = []
    for symbol in ASSETS:
        matches = [token for token in tokens if token.symbol.lower() == symbol.lower()]
        if len(matches) != 1:
            results.append({"symbol": symbol, "status": "not_listed" if not matches else "ambiguous"})
            continue
        token = matches[0]
        program = token.underlying_program
        if not isinstance(program, str) or not re.fullmatch(r"[a-zA-Z0-9_]+\.aleo", program):
            results.append({"symbol": symbol, "status": "invalid_metadata"})
            continue
        try:
            balances = dex.get_private_balances([program], account=client.default_account)
            raw = balances[program]
            results.append({"symbol": symbol, "status": "checked", "raw": str(raw), "amount": format_amount(raw, token.decimals)})
        except Exception:
            results.append({"symbol": symbol, "status": "unavailable"})
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--account", required=True)
    parser.add_argument("--address", required=True)
    parser.add_argument("--network", choices=("mainnet", "testnet", "both"), required=True)
    parser.add_argument("--state-dir", type=Path, required=True)
    parser.add_argument("--prompt", action="store_true", help="Allow password entry in your own terminal")
    args = parser.parse_args()
    validate_address(args.address)
    networks = ("mainnet", "testnet") if args.network == "both" else (args.network,)
    failed = False
    for network in networks:
        stage = "account_and_authentication"
        authenticated = False
        try:
            client, dex, profile = open_session(args.account, args.address, network, args.state_dir, prompt=args.prompt)
            authenticated = True
            stage = "scanner_and_private_balances"
            balances = check_private_balances(client, dex)
            complete = all(asset["status"] in ("checked", "not_listed") for asset in balances)
            print(json.dumps({"network": network, "account": args.account, "address": args.address,
                              "authenticated": True, "scanner": "synced", "stateDir": str(profile.home),
                              "status": "checked" if complete else "incomplete", "visibility": "private", "assets": balances}))
            failed = failed or not complete
        except Exception as error:
            code = getattr(error, "code", None)
            report = {"network": network, "account": args.account, "address": args.address,
                      "authenticated": authenticated, "stage": stage,
                      "status": "scan_pending" if isinstance(error, ScanPendingError) else "unavailable"}
            if isinstance(code, str) and re.fullmatch(r"[A-Z_]+", code):
                report["code"] = code
            print(json.dumps(report))
            failed = True
    return int(failed)


if __name__ == "__main__":
    raise SystemExit(main())
