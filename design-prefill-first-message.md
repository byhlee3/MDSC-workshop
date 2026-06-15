# Design — Pre-rating becomes the first chat message

_Interview held 2026-06-15. Spec: inline feature request._

Feature: when the student submits their pre-rating (score + rationale), that input is
automatically used as their first message to the chatbot, and the chat opens with the
AI already responding to it. Both the student turn and the AI reply are visible in the
chat history.

## 1. Trigger & architecture
**Decision:** Frontend-driven. When `Chat` mounts and the loaded history is empty, it auto-calls the existing `api.sendMessage` with the composed first message, exactly as if the student typed it.
**Reasoning:** Reuses the existing streaming endpoint unchanged — backend already persists the student turn immediately and the AI turn after the stream, so both turns land in history, the reply streams live, and resume-on-refresh works for free.
**Rejected:** Backend-side (insert the first student `Message` in `submit_rating`, then generate). Would require a new "reply to existing last student turn" endpoint since `send_message` always appends a fresh student turn — more moving parts for the same result.

## 2. First-message composition (what text becomes the message)
**Decision:** Compose `My initial rating: {score}/10 — {agreeWord(score)}.\n\n{rationale}` and send it verbatim as the first student turn. Score is included explicitly; rationale is the student's words unedited.
**Reasoning:** The system prompt gives the AI the scenario + the action being rated but NOT the student's stance; fronting the numeric score gives the anchored (pro/anti) AI an explicit target so its opening reply lands well. Reusing `agreeWord(score)` keeps phrasing consistent with the rating UI.
**Rejected:** Rationale-only (drops the number) — leaves the AI guessing the student's position, weakening the opening anchor.

## 3. Display & chat-history rendering
**Decision:** Render the first turn as a normal "You" bubble — identical styling, no special tag/divider. The AI reply streams below as "The Voice" like any exchange. Composed text must be plain (the log renders `m.content` as plain text, no markdown).
**Reasoning:** The intent is that the rating *becomes* the first message, so treating it as an ordinary turn is truest to that and leaves rendering code untouched.
**Rejected:** A distinguishing "Initial rating" tag — adds rendering complexity and frames it as a carried-over verdict rather than the message it now is.

## 4. Gating & message-count semantics
**Decision:** The auto first message counts toward the gate like any student turn — no special-casing. `studentCount` (frontend) and the backend `>= 1` check include it naturally.
**Reasoning:** It is a genuine student-role row; counting it is the zero-extra-code behavior, and the "Continue" gate is an OR with a 5-min floor so the discussion can't be skipped regardless.
**Consequence:** The configured `chat_min_student_messages` (default 5) now means the auto message + 4 typed replies. A facilitator wanting 5 *typed* replies bumps the config to 6.
**Rejected:** Excluding it from the count — extra filtering logic and arguably wrong, since it is the student's message.

## 5. Persistence, resume & idempotency
**Decision (a) — rationale source:** Expose a read-only `pre_rationale` field on `ParticipantState` (added in `_build_state`, read from the pre `Rating`). `Chat` composes the first message from `state.pre_score` + `state.pre_rationale`.
**Decision (b) — send once:** Auto-send only when the *loaded* history returns empty, guarded by a ref so React StrictMode's double-effect (dev) can't double-fire. A refresh after the turns persist sees non-empty history and never re-sends.
**Reasoning:** Exposing `pre_rationale` avoids cross-component state plumbing (the rationale otherwise dies with `RatePhase` on unmount) and survives refresh. The empty-history + ref guard makes the auto-send idempotent. Backend touch is one schema field + one line — narrower than the new endpoint rejected in branch 1.
**Rejected:** Pure-frontend sessionStorage handoff (X) — hackier than a clean read-only field; only virtue was strict zero-backend.

## 6. Edge cases & failure modes
**Decision:** Accept the degraded path on first-reply failure; no auto-retry.
- **First AI reply fails / errors:** backend persists the student turn before streaming, so history is non-empty and auto-send won't re-fire. Show the existing error; the student's first message stays and they continue by typing (AI replies to the next turn). Auto-retry is out — it would need the reply-to-existing endpoint rejected in branch 1.
- **Refresh mid-stream of first reply:** student turn persisted; AI turn persists only after stream completes (possibly partial on dropped connection). Worst case missing/partial first AI reply — same degraded path, acceptable for a live workshop.
- **Empty rationale:** impossible — `RatePhase` disables submit unless `rationale.trim()`, backend `RatingIn` enforces `min_length=1`. Composed message always non-empty.
- **Study-data integrity:** rationale now exists in both the `Rating` row and a `Message` row; `ratings` stays source of truth for scores, so it is harmless duplication. Ordinals: student=0, AI=1.
**Reasoning:** Robustness beyond this would reintroduce backend surface area for a rare, low-stakes (facilitated, in-person) failure.

## Terminology
- **Composed first message** — the plain-text student turn `My initial rating: {score}/10 — {agreeWord(score)}.\n\n{rationale}`, auto-sent as the student's first chat message.
- **Auto-send** — `Chat` calling `api.sendMessage` with the composed first message on mount when loaded history is empty (frontend-driven, reuses the normal streaming endpoint).
- **The gate** — the "Continue to your final verdict" unlock: `elapsed >= chat_min_seconds OR studentCount >= chat_min_student_messages`. The auto-send counts toward `studentCount`.
- **Degraded path** — on first-reply failure, the student turn stays, no AI reply, no auto-retry; the student continues by typing.

## Open questions / deferred decisions
- None open. Facilitator note (not a blocker): `chat_min_student_messages` (default 5) now includes the auto message, so it means auto + 4 typed; bump to 6 for 5 typed replies.
