#!/usr/bin/env python3
"""
Seed orchestrator — called by `make reset` after wiping the database.

Runs each module's seed() in dependency order:
  core → intake → bank → monitoring → release → insights

Each module provides a seed.py with a seed() function.
Modules that haven't been built yet are skipped gracefully.
"""
import importlib
import os
import sys

# Add backend/ to Python path so `app.*` imports work
_BACKEND = os.path.join(os.path.dirname(__file__), "..", "backend")
sys.path.insert(0, os.path.abspath(_BACKEND))

from app.core.db import create_tables, drop_tables  # noqa: E402


def main() -> None:
    print("━" * 50)
    print("  Sakshya — Database Seed")
    print("━" * 50)

    print("\n[1/2] Dropping existing tables...")
    drop_tables()

    print("[2/2] Creating tables...")
    create_tables()

    # Seed order matters: core first (users, policy, clock),
    # then intake (institutes, obligations), then bank (banks, contacts),
    # then monitoring, release, insights.
    steps = [
        ("core",       "app.core.seed"),
        ("intake",     "app.modules.intake.seed"),
        ("bank",       "app.modules.bank.seed"),
        ("monitoring", "app.modules.monitoring.seed"),
        ("release",    "app.modules.release.seed"),
        ("insights",   "app.modules.insights.seed"),
    ]

    for label, module_path in steps:
        try:
            mod = importlib.import_module(module_path)
            fn = getattr(mod, "seed", None)
            if callable(fn):
                print(f"\n── Seeding {label} {'─' * (38 - len(label))}")
                fn()
                print(f"   ✓ {label} done")
            else:
                print(f"   (skip {label} — no seed() yet)")
        except ModuleNotFoundError:
            print(f"   (skip {label} — module not created yet)")
        except Exception as exc:  # noqa: BLE001
            print(f"   ✗ {label} FAILED: {exc}")
            raise

    print("\n" + "━" * 50)
    print("  Seed complete ✓")
    print("━" * 50 + "\n")


if __name__ == "__main__":
    main()

