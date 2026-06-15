"""Admin / facilitator routes. All gated behind the shared admin password."""
from __future__ import annotations

import csv
import io
import secrets

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .db import get_db
from .deps import require_admin
from .models import CONDITIONS, Message, Participant, Rating, Run
from .schemas import (
    ConditionResult,
    CreateRunRequest,
    MonitorParticipant,
    ParticipantPoint,
    ResultsOut,
    RunOut,
)
from .seed import seed_scenario

router = APIRouter(prefix="/api/admin", dependencies=[Depends(require_admin)])


def _generate_join_code() -> str:
    # Readable, unambiguous (no 0/O/1/I), 6 chars.
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(6))


@router.post("/runs", response_model=RunOut)
def create_run(req: CreateRunRequest, db: Session = Depends(get_db)) -> Run:
    scenario = seed_scenario(db)  # ensures the fixed scenario exists
    # Auto-assign the next run number when the client doesn't specify one.
    # run_number is a display label (not unique), so max+1 is fine even after deletes.
    run_number = req.run_number
    if run_number is None:
        run_number = (db.scalar(select(func.max(Run.run_number))) or 0) + 1
    # Retry on the rare join-code collision.
    for _ in range(5):
        code = _generate_join_code()
        if db.execute(select(Run).where(Run.join_code == code)).first() is None:
            break
    else:
        raise HTTPException(status_code=500, detail="Could not allocate join code")
    run = Run(
        run_number=run_number,
        join_code=code,
        facilitator=req.facilitator,
        scenario_id=scenario.id,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


@router.get("/runs", response_model=list[RunOut])
def list_runs(db: Session = Depends(get_db)) -> list[RunOut]:
    runs = db.execute(select(Run).order_by(Run.run_number)).scalars().all()
    out: list[RunOut] = []
    for r in runs:
        ro = RunOut.model_validate(r)
        ro.participant_count = len(r.participants)
        out.append(ro)
    return out


@router.delete("/runs/{run_id}", status_code=204)
def delete_run(run_id: str, db: Session = Depends(get_db)) -> Response:
    """Hard-delete a run and ALL its data (participants, ratings, messages).

    Irreversible; the facilitator confirms in the UI. Child rows are removed in
    FK-safe order rather than relying on SQLite cascade / ORM cascade config.
    """
    run = db.get(Run, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    part_ids = (
        db.execute(select(Participant.id).where(Participant.run_id == run_id))
        .scalars()
        .all()
    )
    if part_ids:
        db.execute(delete(Message).where(Message.participant_id.in_(part_ids)))
        db.execute(delete(Rating).where(Rating.participant_id.in_(part_ids)))
        db.execute(delete(Participant).where(Participant.run_id == run_id))
    db.delete(run)
    db.commit()
    return Response(status_code=204)


@router.get("/runs/{run_id}/monitor", response_model=list[MonitorParticipant])
def monitor(run_id: str, db: Session = Depends(get_db)) -> list[MonitorParticipant]:
    run = db.get(Run, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    participants = (
        db.execute(
            select(Participant)
            .where(Participant.run_id == run_id)
            .order_by(Participant.created_at)
        )
        .scalars()
        .all()
    )
    return [
        MonitorParticipant(
            participant_id=p.id,
            phase=p.phase,
            condition=p.condition,
            joined_at=p.created_at,
        )
        for p in participants
    ]


@router.get("/results", response_model=ResultsOut)
def results(db: Session = Depends(get_db)) -> ResultsOut:
    """Mean pre/post/shift by condition, pooled across all runs."""
    total = db.scalar(select(func.count()).select_from(Participant)) or 0

    by_condition: list[ConditionResult] = []
    completed = 0
    for condition in CONDITIONS:
        # Participants in this condition with both ratings present.
        rows = db.execute(
            select(
                Rating.phase,
                func.avg(Rating.score),
                func.count(func.distinct(Rating.participant_id)),
            )
            .join(Participant, Participant.id == Rating.participant_id)
            .where(Participant.condition == condition)
            .group_by(Rating.phase)
        ).all()
        means = {phase: (avg, n) for phase, avg, n in rows}
        mean_pre = means.get("pre", (None, 0))[0]
        mean_post = means.get("post", (None, 0))[0]
        n_post = means.get("post", (None, 0))[1]
        completed += n_post
        mean_shift = (
            float(mean_post) - float(mean_pre)
            if mean_pre is not None and mean_post is not None
            else None
        )
        by_condition.append(
            ConditionResult(
                condition=condition,
                n=n_post,
                mean_pre=float(mean_pre) if mean_pre is not None else None,
                mean_post=float(mean_post) if mean_post is not None else None,
                mean_shift=mean_shift,
            )
        )
    return ResultsOut(
        total_participants=total, completed=completed, by_condition=by_condition
    )


@router.get("/points", response_model=list[ParticipantPoint])
def points(db: Session = Depends(get_db)) -> list[ParticipantPoint]:
    """Per-participant pre/post scores for completed participants (both ratings),
    for the opinion graph. Anonymous; filtered client-side by run."""
    parts = (
        db.execute(
            select(Participant)
            .where(Participant.condition.is_not(None))
            .order_by(Participant.created_at)
        )
        .scalars()
        .all()
    )
    out: list[ParticipantPoint] = []
    for p in parts:
        scores = {r.phase: r.score for r in p.ratings}
        if "pre" in scores and "post" in scores:
            out.append(
                ParticipantPoint(
                    run_id=p.run_id,
                    run_number=p.run.run_number,
                    condition=p.condition,
                    pre=scores["pre"],
                    post=scores["post"],
                )
            )
    return out


def _participant_dump(db: Session) -> list[dict]:
    """Full per-participant records including transcript + resolved prompt."""
    participants = (
        db.execute(select(Participant).order_by(Participant.created_at)).scalars().all()
    )
    out = []
    for p in participants:
        ratings = {r.phase: r for r in p.ratings}
        pre = ratings.get("pre")
        post = ratings.get("post")
        out.append(
            {
                "participant_id": p.id,
                "run_id": p.run_id,
                "run_number": p.run.run_number,
                "condition": p.condition,
                "phase": p.phase,
                "pre_score": pre.score if pre else None,
                "pre_rationale": pre.rationale if pre else None,
                "post_score": post.score if post else None,
                "post_rationale": post.rationale if post else None,
                "change_report": post.change_report if post else None,
                "shift": (post.score - pre.score) if (pre and post) else None,
                "resolved_system_prompt": p.resolved_system_prompt,
                "transcript": [
                    {"role": m.role, "content": m.content, "ordinal": m.ordinal}
                    for m in p.messages
                ],
            }
        )
    return out


@router.get("/export.json")
def export_json(db: Session = Depends(get_db)) -> JSONResponse:
    return JSONResponse(content={"participants": _participant_dump(db)})


@router.get("/export.csv")
def export_csv(db: Session = Depends(get_db)) -> StreamingResponse:
    rows = _participant_dump(db)
    fields = [
        "participant_id",
        "run_number",
        "condition",
        "phase",
        "pre_score",
        "pre_rationale",
        "post_score",
        "post_rationale",
        "change_report",
        "shift",
    ]
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    for r in rows:
        writer.writerow({k: r.get(k) for k in fields})
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=study_export.csv"},
    )
