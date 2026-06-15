"""Condition assignment: balance cumulatively, stratify against the pre-rating.

Priority order (highest first):
  1. Floor/ceiling safety (hard filter) — never assign a participant to a condition
     where their pre-rating leaves no room to move (e.g. pre=10 cannot move up, so
     `pro` is excluded; pre=1 cannot move down, so `anti` is excluded).
  2. Balance — among valid conditions, fill the one with the fewest assignments so
     far (pooled across all runs), driving toward ~equal thirds (~20/20/20 at n=60).
  3. Directional nudge — on a tie, prefer the condition that pushes *against* the
     participant's starting view.
  4. Random — final tiebreak.
"""
from __future__ import annotations

import random

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import CONDITIONS, Participant

# Midpoint of the 1..10 scale: >= 6 leans "ethical", <= 5 leans "unethical".
_ETHICAL_THRESHOLD = 6


def _valid_conditions(pre_score: int) -> list[str]:
    """Conditions that leave the participant room to move."""
    room_up = pre_score < 10  # `pro` pushes the score up
    room_down = pre_score > 1  # `anti` pushes the score down
    valid = ["control"]
    if room_up:
        valid.append("pro")
    if room_down:
        valid.append("anti")
    return valid


def _directional_opposite(pre_score: int) -> str:
    """The condition that argues against the participant's starting lean.

    `pro` argues the action is ethical (pushes the score up); `anti` argues it is
    unethical (pushes it down). So a participant who already leans "ethical" gets
    nudged toward `anti`, and vice versa.
    """
    return "anti" if pre_score >= _ETHICAL_THRESHOLD else "pro"


def _cumulative_counts(db: Session) -> dict[str, int]:
    rows = db.execute(
        select(Participant.condition, func.count())
        .where(Participant.condition.is_not(None))
        .group_by(Participant.condition)
    ).all()
    counts = {c: 0 for c in CONDITIONS}
    for condition, n in rows:
        counts[condition] = n
    return counts


def choose_condition(db: Session, pre_score: int, rng: random.Random | None = None) -> str:
    """Pick a condition for a participant given their pre-rating."""
    rng = rng or random
    counts = _cumulative_counts(db)
    valid = _valid_conditions(pre_score)

    fewest = min(counts[c] for c in valid)
    candidates = [c for c in valid if counts[c] == fewest]

    if len(candidates) == 1:
        return candidates[0]

    opposite = _directional_opposite(pre_score)
    if opposite in candidates:
        return opposite
    return rng.choice(candidates)
