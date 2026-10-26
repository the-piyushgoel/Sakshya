"""
SQLAlchemy engine, session, and declarative base.

All modules import Base from here and define their models.
schema change? → tell team "SCHEMA CHANGE: <table>" → make reset.
"""
import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool

_BACKEND_DIR = Path(__file__).resolve().parents[2]
# Resolve the development database relative to the backend package, not the
# shell's current directory. This makes records survive server restarts whether
# Uvicorn is launched from the repository root or from `backend/`.
DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{(_BACKEND_DIR / 'data' / 'sakshya.db').as_posix()}",
)

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
_engine_kwargs = {"connect_args": _connect_args}
if ":memory:" in DATABASE_URL:
    _engine_kwargs["poolclass"] = StaticPool

engine = create_engine(DATABASE_URL, **_engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Shared declarative base — all ORM models inherit from this."""
    pass


def get_db():
    """FastAPI dependency — yields a DB session, always closes on exit."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables() -> None:
    """Create all tables defined across modules. Called at startup and in make reset."""
    # Import all model modules so their tables are registered on Base.metadata
    # before create_all is called. Each module's __init__.py should import its models.
    _import_all_models()
    Base.metadata.create_all(bind=engine)


def drop_tables() -> None:
    """Drop all tables (used by make reset before re-seeding)."""
    _import_all_models()
    Base.metadata.drop_all(bind=engine)


def _import_all_models() -> None:
    """
    Eagerly import every models.py in every module so SQLAlchemy knows
    about the tables. Add new modules here as they are created.
    """
    import importlib

    _model_modules = [
        "app.core.models",
        "app.modules.intake.models",
        "app.modules.bank.models",
        "app.modules.monitoring.models",
        "app.modules.release.models",
        "app.modules.insights.models",
    ]
    for mod_path in _model_modules:
        try:
            importlib.import_module(mod_path)
        except ModuleNotFoundError:
            pass  # Module not yet created — skip silently

