# PRD — AI-Persuasion Medical Ethics Workshop

_Finalized 2026-06-14. Full design rationale: see `~/.claude/plans/i-have-a-plan-gleaming-sun.md`._

## Concept
A web app for a workshop with medical students. Present a medical-ethics scenario where the care team takes a specific action; students rate agreement (1–10), discuss the case 1:1 with an AI that is **secretly anchored** to advocate a hidden position, then re-rate. Goal: measure whether and how AI conversation shifts ethical opinions, and whether the AI's anchoring direction matters.

## Research design
- **Primary outcome:** per-participant `shift = post_score − pre_score`, analyzed by hidden condition.
- **Hypothesis:** AI conversation shifts opinions, and the direction tracks the AI's hidden anchor, relative to a neutral control.
- **Conditions (3):** `pro` (AI advocates agreement with the action), `anti` (advocates disagreement), `control` (neutral, never pushes).
- **Assignment:** randomized but **stratified against the participant's pre-rating** (anchor people opposite their starting view to avoid floor/ceiling effects).
- **Cohort:** 10 students/run × 6 runs = 60 total (~20/condition pooled). Per-run aggregate is suggestive only; the real result is cumulative across runs.

## Participant flow (self-paced)
1. **Join** — shared per-run link; anonymous participant ID.
2. **Consent** — honest but does not reveal the manipulation.
3. **Scenario** — case + the action the team took.
4. **Pre-rating** — 1–10 slider + required free-text rationale. (Triggers condition assignment.)
5. **AI chat** — 1:1, time-boxed countdown (~8 min, tunable), minimum time/exchanges before "Continue" unlocks.
6. **Post-rating** — same scenario re-shown; slider + rationale + "did this change your mind?" self-report.
7. **Debrief** — discloses the deception, which condition they were in, and their personal pre→post shift.

## AI behavior
- **Model:** `claude-opus-4-8`, streaming.
- **Prompt:** base persona (thoughtful discussant) + appended condition directive. `pro`/`anti` hold a clear lean and argue **naturalistically** (subtle, collegial, concedes points); `control` is genuinely neutral.
- **Guardrails:** never discloses it was assigned a position (deflect persuasion-probes in character); never fabricates clinical facts or gives harmful medical instructions.

## Data model
- **Scenario** — id, title, body, action_taken, framing notes (seed config).
- **Run** — id, run_number, date, facilitator.
- **Participant** — id, run_id, condition, pre_score_at_assignment, resolved_system_prompt, join time.
- **Rating** — participant_id, phase (pre/post), score, rationale, change_report (post only), timestamp.
- **Message** — participant_id, role (student/ai), content, ordinal, timestamp.

## Architecture
- **Backend:** FastAPI + Pydantic + uv; SQLAlchemy + **SQLite** (`study.db`). Holds the API key and secret prompts; streams Claude via SSE. **Secrets are server-side only.**
- **Frontend:** React + bun + Vite + shadcn/ui + TanStack Query.
- **Auth:** none for students (per-run join code → anonymous ID); single shared admin password for facilitator routes.
- **Hosting:** one small server serving the built frontend + API.

## Admin tooling
- Create-a-run (returns join code), live monitor (who joined + each phase), results dashboard (mean shift by condition, pooled across runs), CSV/JSON export.

## Ethics
- Fully anonymous (no name/email/student ID ever stored). Deception study: consent up front (no manipulation disclosed), **mandatory debrief** discloses it. **IRB / institutional ethics approval is a precondition to running.**

## Scenario (run 1)
Withdrawing life-sustaining treatment from a 24-year-old with severe autoimmune
encephalitis (recovery "highly unlikely but not impossible"); no advance directive;
partner wants withdrawal, parents want treatment continued. **Action rated:** the team
withdraws treatment over the parents' objections. So `pro` argues *for* withdrawal,
`anti` argues *against* it. Defined in `backend/app/seed.py`; anchor banks in
`backend/app/anchors.py` are tuned to this case.

## Open items
- Chat timer duration (default ~8 min) — finalize after a mock run.
- Smoke-test the three anchors against the live model before run 1 (tone + non-disclosure).
- IRB approval — researcher's process.
