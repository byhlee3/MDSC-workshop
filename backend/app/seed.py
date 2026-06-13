"""Seed the single fixed scenario used across all 6 runs.

One scenario for the whole study so pre->post shift can be pooled by condition
without confounding condition with scenario (see PRD.md, section 10).

Edit DEFAULT_SCENARIO to finalize the case before run 1.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Scenario

DEFAULT_SCENARIO = {
    "title": "Withdrawing Life-Sustaining Treatment",
    "body": (
        "A 24-year-old woman has been unconscious for four months following severe "
        "autoimmune encephalitis. Multiple specialists believe meaningful recovery "
        "is highly unlikely, but not impossible.\n\n"
        "She left no written advance care directive, so her own wishes were never "
        "documented. Her parents want all treatment continued indefinitely. Her "
        "partner believes she would not want prolonged life support and wants "
        "treatment withdrawn."
    ),
    "action_taken": (
        "The treating team decided to withdraw life-sustaining treatment, despite "
        "the parents' objections."
    ),
    "framing_notes": (
        "End-of-life decision under deep uncertainty. Tension between respecting the "
        "patient's likely wishes (as voiced by her partner) and avoiding burdensome "
        "treatment of vanishingly small benefit, versus the irreversibility of "
        "withdrawal when recovery is 'not impossible' and her wishes were never "
        "documented — plus an unresolved surrogate conflict between partner and "
        "parents. Defensible arguments exist on both sides."
    ),
}


def seed_scenario(db: Session) -> Scenario:
    """Insert the default scenario if none exists; return the scenario to use."""
    existing = db.execute(select(Scenario)).scalars().first()
    if existing is not None:
        return existing
    scenario = Scenario(**DEFAULT_SCENARIO)
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    return scenario
