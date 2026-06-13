"""FastAPI app: student-facing routes + app wiring. Admin routes live in admin.py."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import chat
from .admin import router as admin_router
from .anchors import resolve_system_prompt
from .assignment import choose_condition
from .config import get_settings
from .db import get_db, init_db
from .deps import get_participant
from .models import PHASES, Message, Participant, Rating, Run
from .schemas import (
    DebriefOut,
    JoinRequest,
    MessageIn,
    MessageOut,
    ParticipantState,
    RatingIn,
    ScenarioOut,
)
from .seed import seed_scenario

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = next(get_db())
    try:
        seed_scenario(db)
    finally:
        db.close()
    yield


app = FastAPI(title="Ethics Workshop", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin_router)


def _phase_index(phase: str) -> int:
    return PHASES.index(phase)


def _student_message_count(db: Session, participant_id: str) -> int:
    return db.scalar(
        select(func.count())
        .select_from(Message)
        .where(Message.participant_id == participant_id, Message.role == "student")
    ) or 0


def _rating(db: Session, participant_id: str, phase: str) -> Rating | None:
    return db.execute(
        select(Rating).where(
            Rating.participant_id == participant_id, Rating.phase == phase
        )
    ).scalar_one_or_none()


def _build_state(db: Session, p: Participant) -> ParticipantState:
    pre = _rating(db, p.id, "pre")
    post = _rating(db, p.id, "post")
    return ParticipantState(
        participant_id=p.id,
        phase=p.phase,
        scenario=ScenarioOut.model_validate(p.run.scenario),
        chat_duration_seconds=settings.chat_duration_seconds,
        chat_min_seconds=settings.chat_min_seconds,
        chat_min_student_messages=settings.chat_min_student_messages,
        pre_score=pre.score if pre else None,
        post_score=post.score if post else None,
        student_message_count=_student_message_count(db, p.id),
    )


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/join", response_model=ParticipantState)
def join(req: JoinRequest, db: Session = Depends(get_db)) -> ParticipantState:
    run = db.execute(
        select(Run).where(Run.join_code == req.join_code)
    ).scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="Invalid join code")
    participant = Participant(run_id=run.id, phase="joined")
    db.add(participant)
    db.commit()
    db.refresh(participant)
    return _build_state(db, participant)


@app.get("/api/participants/{participant_id}", response_model=ParticipantState)
def get_state(
    p: Participant = Depends(get_participant), db: Session = Depends(get_db)
) -> ParticipantState:
    return _build_state(db, p)


@app.post("/api/participants/{participant_id}/consent", response_model=ParticipantState)
def accept_consent(
    p: Participant = Depends(get_participant), db: Session = Depends(get_db)
) -> ParticipantState:
    """Consent accepted -> advance to scenario (idempotent, forward-only)."""
    if _phase_index(p.phase) < _phase_index("scenario"):
        p.phase = "scenario"
        db.commit()
    return _build_state(db, p)


@app.post("/api/participants/{participant_id}/rating", response_model=ParticipantState)
def submit_rating(
    body: RatingIn,
    phase: str = Query(pattern="^(pre|post)$"),
    p: Participant = Depends(get_participant),
    db: Session = Depends(get_db),
) -> ParticipantState:
    if _rating(db, p.id, phase) is not None:
        raise HTTPException(status_code=409, detail=f"{phase}-rating already submitted")

    if phase == "pre":
        if p.phase != "scenario":
            raise HTTPException(status_code=409, detail="Not at the pre-rating step")
        # Pre-rating drives stratified assignment + locks in the resolved prompt.
        condition = choose_condition(db, body.score)
        p.condition = condition
        p.pre_score_at_assignment = body.score
        p.resolved_system_prompt = resolve_system_prompt(condition, p.run.scenario)
        p.phase = "chatting"
    else:  # post
        if p.phase != "chatting":
            raise HTTPException(status_code=409, detail="Not at the post-rating step")
        msgs = _student_message_count(db, p.id)
        if msgs < settings.chat_min_student_messages:
            raise HTTPException(
                status_code=409,
                detail=f"Need at least {settings.chat_min_student_messages} messages "
                f"before finishing (sent {msgs}).",
            )
        p.phase = "post"

    db.add(
        Rating(
            participant_id=p.id,
            phase=phase,
            score=body.score,
            rationale=body.rationale,
            change_report=body.change_report if phase == "post" else None,
        )
    )
    db.commit()
    db.refresh(p)
    return _build_state(db, p)


@app.get(
    "/api/participants/{participant_id}/messages", response_model=list[MessageOut]
)
def list_messages(
    p: Participant = Depends(get_participant), db: Session = Depends(get_db)
) -> list[Message]:
    return (
        db.execute(
            select(Message)
            .where(Message.participant_id == p.id)
            .order_by(Message.ordinal)
        )
        .scalars()
        .all()
    )


@app.post("/api/participants/{participant_id}/messages")
def send_message(
    body: MessageIn,
    p: Participant = Depends(get_participant),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    if p.phase != "chatting":
        raise HTTPException(status_code=409, detail="Chat is not active")
    if not p.resolved_system_prompt:
        raise HTTPException(status_code=409, detail="No anchor resolved for participant")

    next_ordinal = (
        db.scalar(
            select(func.coalesce(func.max(Message.ordinal), -1)).where(
                Message.participant_id == p.id
            )
        )
        + 1
    )
    db.add(
        Message(
            participant_id=p.id,
            role="student",
            content=body.content,
            ordinal=next_ordinal,
        )
    )
    db.commit()

    # Snapshot what the stream needs, so the streaming generator doesn't depend on
    # this request's session staying open.
    system_prompt = p.resolved_system_prompt
    history = [
        (m.role, m.content)
        for m in db.execute(
            select(Message)
            .where(Message.participant_id == p.id)
            .order_by(Message.ordinal)
        ).scalars()
    ]
    participant_id = p.id
    ai_ordinal = next_ordinal + 1

    def event_stream():
        parts: list[str] = []
        try:
            for delta in chat.stream_reply(
                system_prompt, chat.to_anthropic_messages(history)
            ):
                parts.append(delta)
                yield delta
        finally:
            # Persist the AI reply with a fresh session once the stream is done.
            from .db import SessionLocal

            full = "".join(parts)
            if full:
                with SessionLocal() as s:
                    s.add(
                        Message(
                            participant_id=participant_id,
                            role="ai",
                            content=full,
                            ordinal=ai_ordinal,
                        )
                    )
                    s.commit()

    return StreamingResponse(event_stream(), media_type="text/plain")


@app.get("/api/participants/{participant_id}/debrief", response_model=DebriefOut)
def debrief(
    p: Participant = Depends(get_participant), db: Session = Depends(get_db)
) -> DebriefOut:
    pre = _rating(db, p.id, "pre")
    post = _rating(db, p.id, "post")
    if p.condition is None or pre is None or post is None:
        raise HTTPException(status_code=409, detail="Study not complete")
    if _phase_index(p.phase) < _phase_index("done"):
        p.phase = "done"
        db.commit()
    return DebriefOut(
        condition=p.condition,
        pre_score=pre.score,
        post_score=post.score,
        shift=post.score - pre.score,
    )
