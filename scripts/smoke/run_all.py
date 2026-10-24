#!/usr/bin/env python3
"""
Smoke test orchestrator — runs all lane smoke scripts in order.
Each lane adds their file at scripts/smoke/<lane>_smoke.py.
Usage: make smoke
"""
import os
import subprocess
import sys

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Each lane creates their own smoke script here
_LANE_SCRIPTS = [
    "pr_smoke.py",   # Premansh — core + release + public
    "py_smoke.py",   # Piyush   — intake + bank
    "mk_smoke.py",   # Mehak    — insights
    "pa_smoke.py",   # Payal    — (no backend smoke needed; FE build check)
]

_failed: list[str] = []

for script in _LANE_SCRIPTS:
    path = os.path.join(_SCRIPT_DIR, script)
    if not os.path.exists(path):
        print(f"  (skip {script} — not yet created)")
        continue

    print(f"\n── Running {script} {'─' * (40 - len(script))}")
    result = subprocess.run([sys.executable, path], capture_output=False)
    if result.returncode != 0:
        _failed.append(script)

print()
if _failed:
    print(f"❌ SMOKE FAILED: {', '.join(_failed)}")
    sys.exit(1)
else:
    print("✅ All smoke tests passed")

