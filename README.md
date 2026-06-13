# Medical Ethics × AI Persuasion Workshop

A web app for a workshop study with medical students. Students read a clinical-ethics
case, rate how much they agree with the care team's action (1–10), discuss the case 1:1
with an AI that is **secretly anchored** to a hidden position (`pro` / `anti` / `control`),
then re-rate. We measure whether and how the AI conversation shifts their view.

See `PRD.md` for the full design and rationale.

## Stack
- **Backend:** FastAPI + SQLAlchemy + SQLite, Anthropic streaming (`claude-opus-4-8`). Managed with `uv`.
- **Frontend:** React + Vite (bun). Minimal styling for now.

## Run locally

**1. Backend**
```bash
cd backend
cp .env.example .env          # then put your real ANTHROPIC_API_KEY + ADMIN_PASSWORD in .env
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

**2. Frontend** (separate terminal)
```bash
cd frontend
bun install
bun run dev                   # http://localhost:5173  (proxies /api to :8000)
```

- **Students:** open `http://localhost:5173` and enter the join code.
- **Facilitator:** open `http://localhost:5173/#admin`, log in with `ADMIN_PASSWORD`, create a run to get a join code, watch the live monitor, view pooled results, download the CSV.

## Tests
```bash
cd backend && uv run pytest
```

## Before the first real run (pre-flight)
- Institutional ethics / IRB approval in hand.
- Real `ANTHROPIC_API_KEY` and a strong `ADMIN_PASSWORD` set in `backend/.env`.
- Smoke-test all three anchors by joining as a test participant and reading the AI's tone
  (it must hold its lean **without** disclosing it was assigned a position).
- Finalize the scenario text in `backend/app/seed.py` and the chat timing in `.env`
  (`CHAT_DURATION_SECONDS`, `CHAT_MIN_SECONDS`, `CHAT_MIN_STUDENT_MESSAGES`).

## Notes
- The hidden anchor prompts live in `backend/app/anchors.py` and are **server-side only** —
  they are never sent to the browser. The exact resolved prompt is logged per participant.
- The whole dataset is the single file `backend/study.db` (plus the CSV/JSON export).
