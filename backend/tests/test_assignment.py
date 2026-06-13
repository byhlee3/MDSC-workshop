"""Assignment logic: floor/ceiling safety, cumulative balance, directional nudge."""
from __future__ import annotations

import random

from app.assignment import choose_condition
from app.models import Participant


def _assign_and_record(db, pre_score, rng):
    condition = choose_condition(db, pre_score, rng=rng)
    db.add(Participant(run_id="r", condition=condition, pre_score_at_assignment=pre_score))
    db.commit()
    return condition


def test_ceiling_never_assigned_pro(db_session):
    rng = random.Random(0)
    # pre=10 has no room to move up -> never `pro`.
    for _ in range(30):
        assert choose_condition(db_session, 10, rng=rng) != "pro"


def test_floor_never_assigned_anti(db_session):
    rng = random.Random(0)
    # pre=1 has no room to move down -> never `anti`.
    for _ in range(30):
        assert choose_condition(db_session, 1, rng=rng) != "anti"


def test_balances_toward_thirds(db_session):
    rng = random.Random(42)
    # Mixed pre-scores across a realistic 60-person cohort.
    scores = [((i * 7) % 10) + 1 for i in range(60)]
    for s in scores:
        _assign_and_record(db_session, s, rng)

    counts = {c: 0 for c in ("pro", "anti", "control")}
    for p in db_session.query(Participant).all():
        counts[p.condition] += 1

    # Each cell should be close to 20; the spread stays tight.
    assert max(counts.values()) - min(counts.values()) <= 3
    assert sum(counts.values()) == 60


def test_directional_nudge_on_tie(db_session):
    rng = random.Random(0)
    # Empty DB: all counts 0, so it's a pure tie. A high pre-score (agrees)
    # should be nudged toward `anti` (argues against them).
    assert choose_condition(db_session, 9, rng=rng) == "anti"
    # A low pre-score (disagrees) should be nudged toward `pro`.
    assert choose_condition(db_session, 2, rng=rng) == "pro"
