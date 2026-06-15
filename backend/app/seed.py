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
    "title": "Breaking Confidence to Warn a Relative",
    "body": (
        "You are the physician who ordered genetic testing for Daniel, 41, after "
        "his colorectal cancer was diagnosed unusually early. The results confirm "
        "Lynch syndrome, an inherited condition that sharply raises the lifetime "
        "risk of colorectal, uterine, and several other cancers. For people who "
        "know they carry it, regular screening and prevention cut that risk "
        "dramatically and catch cancers early, while they are still curable.\n\n"
        "Daniel has one sibling: a 38-year-old sister, Maria, who has roughly a "
        "50% chance of carrying the same mutation. She has two young children. If "
        "Maria learns of her risk and is screened, a cancer is very likely to be "
        "caught in time; if she never learns of it, the first sign may be "
        "advanced, incurable disease.\n\n"
        "You urge Daniel to tell Maria, or to let you tell her. He refuses — "
        "flatly and repeatedly. He and Maria have been estranged for years after a "
        "bitter family dispute; he wants her nowhere near his medical life, and he "
        "insists the result is his private information. He is fully competent and "
        "understands exactly what he is declining. He forbids you to contact her.\n\n"
        "Maria is not your patient. She has not asked to know anything. No law "
        "clearly compels you either way, and your colleagues are divided. The "
        "decision is yours."
    ),
    "action_taken": (
        "You contact Maria and tell her she may be at genetic risk, against "
        "Daniel's explicit refusal."
    ),
    "framing_notes": (
        "Patient confidentiality and autonomy versus the duty to prevent serious, "
        "preventable harm to an identifiable third party. The patient is competent "
        "and explicitly refuses disclosure; the at-risk relative has an actionable, "
        "life-saving intervention available (screening) but has not asked to know. "
        "Defensible arguments exist on both sides and no clear legal duty or "
        "guideline resolves it (cf. ABC v St George's), so the clinician must "
        "balance it. The student rates how ethical 'the action' (contacting Maria) "
        "is — a moral judgement, separate from whether they would personally do it. "
        "Stance: pro argues the action is ethical/right, anti argues it is "
        "unethical/wrong."
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
