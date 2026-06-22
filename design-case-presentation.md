# Design — Case presentation & chat-page polish

_Interview held 2026-06-22. Spec: inline feature request._

Four changes to the ethics workshop frontend:
1. Format the case for readability: real paragraphs + sparing bold on key task/words.
2. Show the case on the chat page so students can reference it while discussing.
3. Rename the LLM label "The Voice" -> "Discussion partner".
4. Remove em dashes from the frontend; use single hyphens.

## 1. Case formatting — markup approach & what gets bolded
**Decision:** Store the case as lightweight **markdown** in `seed.py` (paragraphs via `\n\n`, bold via `**...**`) as the single source of truth, and render that markdown on the frontend. Bold ~4 load-bearing spans in the body: **Lynch syndrome**, **roughly 50%**, **fully competent**, **forbids you to contact her**, plus **The decision is yours**. The action/task stays in its own distinct box (no inline bold needed).
**Reasoning:** One source of truth — the same text already feeds the LLM prompt — beats a hardcoded second copy in React that could drift. Sparing bold (4-5 spans) keeps the emphasis meaningful.
**Rejected:** Hardcoding a separately-formatted case in the frontend (duplicates content, drifts from the prompt's copy).

## 2. Markdown rendering implementation
**Decision:** Hand-rolled renderer (~15 lines): split the scenario body on `\n\n` into `<p>`, parse `**...**` into `<strong>` within each paragraph, building real React elements (no `dangerouslySetInnerHTML`). Applied only to the scenario body. No new dependency.
**Reasoning:** Only paragraphs + bold are needed; react-markdown is a large dep tree for that, and the AI chat is forbidden from emitting markdown so it isn't needed there. Matches the project's minimal-first, no-deps ethos.
**Rejected:** react-markdown (oversized for two features; cuts against the minimal ethos).

## 3. Case content source-of-truth & reseed strategy
**Decision:** Change `seed_scenario()` to refresh-on-boot (upsert): if a scenario exists, update its `title`/`body`/`action_taken`/`framing_notes` from `DEFAULT_SCENARIO` keeping the same row id; otherwise insert. Code (`seed.py`) is the single source of truth.
**Reasoning:** The live DB is already seeded, so insert-if-empty won't apply edits. Upsert auto-applies any future case edit on deploy with no manual disk surgery, keeps the id stable so `Run` FKs hold, and leaves participant/rating/message data untouched.
**Rejected:** Deleting `study.db` on the Render disk (destroys collected data); a one-off admin refresh endpoint (extra surface for a one-time need).
**Caveat:** Code becomes authoritative — a hand-edited scenario row would be overwritten on redeploy. Acceptable: there is no admin UI to edit the case; code is the only path.

## 4. Case on the chat page (placement & form)
**Decision:** Reuse the case card as a collapsible panel above the chat card, expanded by default, with a collapse toggle in its eyebrow row. Implement via an optional `collapsible` prop on `ScenarioCard` (local `collapsed` state). Includes title, body, and the action/task box.
**Reasoning:** Lets students constantly reference the case while keeping the option to collapse it and focus on chatting; minimal change, reuses the existing component, works on mobile/tablet.
**Rejected:** Two-column sticky layout (best for reference but a larger layout change); always-visible no-collapse (more scrolling to reach the input each turn).

## 5. Rename "The Voice" -> "Discussion partner"
**Decision:** Replace both "The Voice" labels (App.tsx:357, :363) with "Discussion partner". Student label stays "You". CSS may uppercase it for display, consistent with existing turn-label styling and the backend persona.
**Reasoning:** Trivial, two spots; matches the persona's self-description.

## 6. Em-dash removal scope
**Decision:** Replace `—` with `-` (preserving surrounding spaces) across all rendered frontend text: every em dash in `App.tsx` (UI literals, the auto-first-message template at :269, admin `'—'` no-value placeholders) and in the displayed case content (`seed.py` `body` + `action_taken`, reaching the live DB via the branch-3 upsert). Normalize any stray en dashes (`–`) too. The decorative `"— Begin the discussion below. —"` becomes `"Begin the discussion below."` (drop flanking dashes rather than leave stray hyphens).
**Out of scope:** CSS comments in `index.css` (never rendered); backend prompt text in `anchors.py` (sent to the LLM, not displayed).
**Reasoning:** "From the frontend" = anything that renders; internal/never-displayed text is left alone.

## Terminology
- **Case renderer** — the hand-rolled component that splits the scenario body on `\n\n` into `<p>` and parses `**...**` into `<strong>` (real React elements, no `dangerouslySetInnerHTML`).
- **Refresh-on-boot upsert** — `seed_scenario()` updating the existing scenario row's fields from `DEFAULT_SCENARIO` (same id) on each startup; code is the source of truth.
- **Collapsible case panel** — `ScenarioCard` rendered with a `collapsible` prop (expanded by default) above the chat card.
- **Discussion partner** — the displayed label for the LLM (replaces "The Voice").

## Open questions / deferred decisions
- None.
