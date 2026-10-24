"""
Shared pytest configuration.
Sets up the test database to use an in-memory SQLite instance
so tests never touch the real dev database.
"""
import os
import pytest

# Force in-memory DB for all tests
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("DEMO_MODE", "true")
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production-use")

from app.core.db import create_tables, drop_tables  # noqa: E402


@pytest.fixture(autouse=True, scope="session")
def setup_db():
    """Create tables once per test session."""
    create_tables()
    yield
    drop_tables()

