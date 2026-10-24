"""
Sakshya — FastAPI application entry point.

Auto-discovery: any file at modules/*/router.py that exports a `router`
variable (APIRouter) is automatically included under /api.
NEVER edit this file to add new module routes — add a router.py in your module.
"""
from contextlib import asynccontextmanager
import importlib
import os
from pathlib import Path
import sys

# Ensure 'backend' directory is always on sys.path regardless of CWD
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core import clock, policy
from app.core.db import create_tables
from app.core.errors import SakshyaError, sakshya_error_handler
from app.core.router import router as core_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(_BACKEND_DIR / "data" / "files", exist_ok=True)
    create_tables()
    clock.sync_from_db()
    policy.reload_cache()
    yield


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
    lifespan=lifespan,
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

# ── Core router (auth, users) ─────────────────────────────────────────────────
app.include_router(core_router, prefix="/api")

# ── Auto-discover module routers ──────────────────────────────────────────────

_modules_dir = Path(__file__).parent / "modules"

for _router_file in sorted(_modules_dir.glob("*/router.py")):
    _module_name = f"app.modules.{_router_file.parent.name}.router"
    try:
        _mod = importlib.import_module(_module_name)
        if hasattr(_mod, "router"):
            app.include_router(_mod.router, prefix="/api")
    except Exception as exc:  # noqa: BLE001
        print(f"[WARN] Could not load router {_module_name}: {exc}")

# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/api/health", tags=["meta"])
def health():
    """Health check — verify the server is up."""
    return {"status": "ok", "version": "1.0.0", "demo_mode": os.getenv("DEMO_MODE", "false").lower() == "true"}
