"""Test fixtures: isolated in-memory SQLite + a TestClient with the chat proxy stubbed."""
from __future__ import annotations

import os

# Pin the admin password BEFORE app/config is imported so a developer's local
# backend/.env can't leak in and break the admin-auth tests. Env vars take
# precedence over the .env file in pydantic-settings.
os.environ["ADMIN_PASSWORD"] = "change-me"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


@pytest.fixture
def db_session():
    from app.db import Base

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    import app.models  # noqa: F401  (register tables)

    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(monkeypatch):
    """TestClient backed by a throwaway in-memory DB, with Anthropic stubbed."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    import app.db as db_module

    monkeypatch.setattr(db_module, "engine", engine)
    monkeypatch.setattr(db_module, "SessionLocal", TestingSession)

    # Stub the model stream so tests never hit the network.
    import app.chat as chat_module

    def fake_stream(system_prompt, anthropic_messages):
        yield "I see your point. "
        yield "Here's another angle."

    monkeypatch.setattr(chat_module, "stream_reply", fake_stream)

    from app.main import app

    with TestClient(app) as c:
        yield c
