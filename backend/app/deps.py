"""Shared FastAPI dependencies: admin auth + participant lookup."""
from __future__ import annotations

import secrets

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import Participant

settings = get_settings()


def require_admin(x_admin_password: str = Header(default="")) -> None:
    """Gate admin routes behind the single shared password (constant-time check)."""
    if not secrets.compare_digest(x_admin_password, settings.admin_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Bad admin password"
        )


def get_participant(participant_id: str, db: Session = Depends(get_db)) -> Participant:
    participant = db.get(Participant, participant_id)
    if participant is None:
        raise HTTPException(status_code=404, detail="Participant not found")
    return participant
