"""seed_scenario is a refresh-on-boot upsert: insert once, then update in place."""
from __future__ import annotations

from sqlalchemy import func, select

from app import seed
from app.models import Scenario


def test_seed_inserts_when_empty(db_session):
    scenario = seed.seed_scenario(db_session)
    assert scenario.title == seed.DEFAULT_SCENARIO["title"]
    assert db_session.scalar(select(func.count()).select_from(Scenario)) == 1


def test_seed_refreshes_in_place_keeping_id(db_session, monkeypatch):
    first = seed.seed_scenario(db_session)
    original_id = first.id

    # Simulate a content edit shipped in code, then a redeploy (second seed).
    monkeypatch.setitem(seed.DEFAULT_SCENARIO, "body", "Updated body with **bold**.")
    second = seed.seed_scenario(db_session)

    assert second.id == original_id  # same row, FKs preserved
    assert second.body == "Updated body with **bold**."
    # Still exactly one scenario row (no duplicate inserted).
    assert db_session.scalar(select(func.count()).select_from(Scenario)) == 1
