"""SQLAlchemy models. See PRD.md for the data model rationale."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

# Participant journey phases (used by the live monitor and resume-on-refresh).
# Forward-only state machine; index order is meaningful.
PHASES = ("joined", "scenario", "chatting", "post", "done")

# Experimental conditions.
CONDITIONS = ("pro", "anti", "control")


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    action_taken: Mapped[str] = mapped_column(Text, nullable=False)
    framing_notes: Mapped[str] = mapped_column(Text, default="")


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    run_number: Mapped[int] = mapped_column(Integer, nullable=False)
    join_code: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    facilitator: Mapped[str] = mapped_column(String, default="")
    scenario_id: Mapped[str] = mapped_column(ForeignKey("scenarios.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    scenario: Mapped[Scenario] = relationship()
    participants: Mapped[list["Participant"]] = relationship(back_populates="run")


class Participant(Base):
    __tablename__ = "participants"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id"), nullable=False)
    phase: Mapped[str] = mapped_column(String, default="joined", nullable=False)

    # Assigned only once the pre-rating arrives (so it can stratify on pre_score).
    condition: Mapped[str | None] = mapped_column(String, nullable=True)
    pre_score_at_assignment: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resolved_system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    run: Mapped[Run] = relationship(back_populates="participants")
    ratings: Mapped[list["Rating"]] = relationship(back_populates="participant")
    messages: Mapped[list["Message"]] = relationship(
        back_populates="participant", order_by="Message.ordinal"
    )


class Rating(Base):
    __tablename__ = "ratings"
    __table_args__ = (UniqueConstraint("participant_id", "phase", name="uq_rating_phase"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    participant_id: Mapped[str] = mapped_column(
        ForeignKey("participants.id"), nullable=False
    )
    phase: Mapped[str] = mapped_column(String, nullable=False)  # "pre" | "post"
    score: Mapped[int] = mapped_column(Integer, nullable=False)  # 1..10
    rationale: Mapped[str] = mapped_column(Text, nullable=False)
    change_report: Mapped[str | None] = mapped_column(Text, nullable=True)  # post only
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    participant: Mapped[Participant] = relationship(back_populates="ratings")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    participant_id: Mapped[str] = mapped_column(
        ForeignKey("participants.id"), nullable=False
    )
    role: Mapped[str] = mapped_column(String, nullable=False)  # "student" | "ai"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    participant: Mapped[Participant] = relationship(back_populates="messages")
