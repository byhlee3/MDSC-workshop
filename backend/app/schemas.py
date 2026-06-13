"""Pydantic request/response models. Note: these intentionally never expose a
participant's `condition` or `resolved_system_prompt` to the student-facing client."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# ---- Scenario (safe to send to students) ----
class ScenarioOut(BaseModel):
    id: str
    title: str
    body: str
    action_taken: str

    model_config = ConfigDict(from_attributes=True)


# ---- Join / participant ----
class JoinRequest(BaseModel):
    join_code: str


class ParticipantState(BaseModel):
    """Returned to the student client. Deliberately omits condition + prompt."""

    participant_id: str
    phase: str
    scenario: ScenarioOut
    chat_duration_seconds: int
    chat_min_seconds: int
    chat_min_student_messages: int
    pre_score: int | None = None
    post_score: int | None = None
    student_message_count: int = 0


# ---- Ratings ----
class RatingIn(BaseModel):
    score: int = Field(ge=1, le=10)
    rationale: str = Field(min_length=1)
    change_report: str | None = None  # post-rating only


# ---- Chat ----
class MessageIn(BaseModel):
    content: str = Field(min_length=1)


class MessageOut(BaseModel):
    role: str
    content: str
    ordinal: int

    model_config = ConfigDict(from_attributes=True)


# ---- Debrief (post-study; condition is now safe to reveal) ----
class DebriefOut(BaseModel):
    condition: str
    pre_score: int
    post_score: int
    shift: int


# ---- Admin ----
class CreateRunRequest(BaseModel):
    run_number: int
    facilitator: str = ""


class RunOut(BaseModel):
    id: str
    run_number: int
    join_code: str
    facilitator: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MonitorParticipant(BaseModel):
    participant_id: str
    phase: str
    condition: str | None
    joined_at: datetime


class ConditionResult(BaseModel):
    condition: str
    n: int
    mean_pre: float | None
    mean_post: float | None
    mean_shift: float | None


class ResultsOut(BaseModel):
    total_participants: int
    completed: int
    by_condition: list[ConditionResult]
