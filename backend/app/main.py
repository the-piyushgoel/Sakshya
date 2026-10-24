"""
Sakshya — FastAPI application entry point.

Auto-discovery: any file at modules/*/router.py that exports a `router`
variable (APIRouter) is automatically included under /api.
NEVER edit this file to add new routes — add a router.py in your module.
"""
import importlib
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.db import create_tables
from app.core.errors import SakshyaError, sakshya_error_handler

# ── App definition ────────────────────────────────────────────────────────────

app = FastAPI(
    title="Sakshya",
    summary="AICTE FDR Portal — Prototype v1.0",
    description=(
        "Evidence-backed Fixed Deposit Receipt management for AICTE.\n\n"
        "**Demo credentials:** password `demo@123` · step-up PIN `246810`\n\n"
        "All times use a simulated clock (`POST /api/admin/clock/advance`). "
        "All money is in **integer paise** internally."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — open in demo/dev; tighten for production
_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Sakshya error handler
app.add_exception_handler(SakshyaError, sakshya_error_handler)  # type: ignore[arg-type]

# ── Auto-discover module routers ──────────────────────────────────────────────

_modules_dir = Path(__file__).parent / "modules"

for _router_file in sorted(_modules_dir.glob("*/router.py")):
    _module_name = f"app.modules.{_router_file.parent.name}.router"
    try:
        _mod = importlib.import_module(_module_name)
        if hasattr(_mod, "router"):
            app.include_router(_mod.router, prefix="/api")
    except Exception as exc:  # noqa: BLE001
        # Log but don't crash — lets partial scaffold still start
        print(f"[WARN] Could not load router {_module_name}: {exc}")

# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
def on_startup() -> None:
    os.makedirs("data/files", exist_ok=True)
    create_tables()

# ── Core endpoints (auth, admin, notifications) ───────────────────────────────
# These live directly in main.py for now; they will be moved to core/router.py
# in PR-2 (auth) and PR-3 (admin/clock).

@app.get("/api/health", tags=["meta"])
def health():
    """Health check — verify the server is up."""
    return {"status": "ok", "version": "1.0.0", "demo_mode": os.getenv("DEMO_MODE", "false").lower() == "true"}

