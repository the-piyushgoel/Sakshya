# ── Sakshya Makefile ──────────────────────────────────────────────────────────
# Usage:
#   make venv      — create Python venv at backend/.venv (first time setup)
#   make install   — install Python deps into the venv
#   make run       — start FastAPI dev server (reload mode)
#   make reset     — wipe DB + re-seed (safe to run multiple times)
#   make test      — run pytest
#   make smoke     — run smoke tests (server must be running separately)
#
# Windows PowerShell equivalents are documented in README.md.

PYTHON   := backend/.venv/bin/python
PIP      := backend/.venv/bin/pip
UVICORN  := backend/.venv/bin/uvicorn
PYTEST   := backend/.venv/bin/pytest

.PHONY: venv install run reset test smoke

venv:
	python3 -m venv backend/.venv
	@echo "Venv created. Run 'make install' next."

install: venv
	$(PIP) install -r backend/requirements.txt

run:
	cd backend && $(abspath $(UVICORN)) app.main:app --reload --host 0.0.0.0 --port 8000

reset:
	@echo "Wiping database and re-seeding..."
	@mkdir -p backend/data/files
	cd backend && $(abspath $(PYTHON)) ../scripts/seed_all.py
	@echo "Reset complete. Run 'make run' to start the server."

test:
	cd backend && $(abspath $(PYTEST)) -q tests/

smoke:
	$(PYTHON) scripts/smoke/run_all.py

