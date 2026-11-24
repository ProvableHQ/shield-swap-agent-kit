"""Read installed package metadata or public Aleo account descriptions only."""

import importlib.metadata
import json
import sys


def inspect_packages():
    packages = []
    for name in ("aleo-sdk", "shield-swap-sdk", "aleo-bridge-sdk", "web3", "solders"):
        try:
            distribution = importlib.metadata.distribution(name)
        except importlib.metadata.PackageNotFoundError:
            continue
        packages.append({"name": name, "version": distribution.version,
                         "path": str(distribution.locate_file(""))})
    return {"version": ".".join(map(str, sys.version_info[:3])), "prefix": sys.prefix, "packages": packages}


def inspect_accounts():
    entries = json.load(sys.stdin)
    try:
        from aleo import keystore
        reader = keystore.info
    except (ImportError, AttributeError):
        return {"supported": False}
    accounts = []
    for entry in entries:
        try:
            stored = reader(name=entry["name"], dir=entry["directory"])
            accounts.append({"address": stored.address, "storage": stored.storage}
                            if stored is not None else {"status": "unavailable"})
        except Exception:
            # SDK errors may contain private file contents. Never forward them.
            accounts.append({"status": "unavailable"})
    return {"supported": True, "accounts": accounts}


if __name__ == "__main__":
    try:
        result = inspect_packages() if sys.argv[1] == "packages" else inspect_accounts()
        print(json.dumps(result))
    except Exception:
        print(json.dumps({"supported": False}))
        sys.exit(1)
