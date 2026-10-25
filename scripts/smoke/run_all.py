#!/usr/bin/env python3
"""
Smoke test orchestrator — runs all lane smoke scripts in order.
Usage: make smoke
"""
import os
import subprocess
import sys

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_ROOT_DIR = os.path.abspath(os.path.join(_SCRIPT_DIR, "..", ".."))
_BACKEND_DIR = os.path.join(_ROOT_DIR, "backend")
_SEED_SCRIPT = os.path.join(_ROOT_DIR, "scripts", "seed_all.py")


def reset_db() -> None:
    """Reset database to deterministic seed state."""
    subprocess.run([sys.executable, _SEED_SCRIPT], cwd=_BACKEND_DIR, check=True, capture_output=True)


# Smoke scripts to run
_LANE_SCRIPTS = [
    ("pr_smoke.py", "Lane A: Premansh (Spine, Monitoring, Release & Verification)"),
    ("py_smoke.py", "Lane B: Piyush (Intake, Forgery & Bank Confirmation Chain)"),
    ("mk_smoke.py", "Lane C: Mehak (Insights, Risk Algorithm & Leadership KPIs)"),
    ("golden_smoke.py", "Master E2E: 12-Step Golden Path (G1–G12)"),
]

_failed: list[str] = []

print("━" * 65)
print("  SAKSHYA v1.0 — MASTER SMOKE TEST ORCHESTRATOR")
print("━" * 65)

for script, description in _LANE_SCRIPTS:
    path = os.path.join(_SCRIPT_DIR, script)
    if not os.path.exists(path):
        print(f"  (skip {script} — not yet created)")
        continue

    # Reset database before each smoke test script for guaranteed isolation
    reset_db()

    print(f"\n── Running {script} ({description}) ──")
    result = subprocess.run([sys.executable, path], cwd=_ROOT_DIR, capture_output=False)
    if result.returncode != 0:
        _failed.append(script)

print("\n" + "━" * 65)
if _failed:
    print(f"❌ SMOKE SUITE FAILED: {', '.join(_failed)}")
    sys.exit(1)
else:
    print("✅ ALL SMOKE TESTS PASSED CLEANLY (PR, PY, MK & GOLDEN PATH)")
print("━" * 65 + "\n")

