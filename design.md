# Design — Aesthetic refresh + facilitator results graph

_Interview held 2026-06-14. Spec: user brief. All branches closed._

Three changes requested:
1. Update the PRD ethics section (debrief is now facilitator-led/live, not on-screen).
2. Re-skin the UI: keep the minimalism, drop the retro serif → **modern minimalism**, sans-serif type, more rounded shapes/edges.
3. Facilitator results **graph**: plot every participant's *initial* opinion, then a button overlays their *new* opinion, with shift stats.

## 1. Aesthetic redesign (typography, shape, palette)
**Decision:** Modern-minimal "clean & cool": **Inter** for all UI/body text (a mono — keep IBM Plex Mono — for numerals: timer, join codes, scores, graph axis); cool near-white background (~#fafafa) with near-black ink (~#111) and soft grey hairlines; **12–14px rounded** corners, pill-ish buttons, subtle soft shadows. **Fully monochrome — no accent hue** (greyscale only; emphasis via contrast/weight). Replaces the retro Special Elite + EB Garamond + oxblood theme; keeps the minimalism, double-rule book frames go away in favour of soft cards.
**Reasoning:** User wants modern minimalism with sans type and rounded shapes; chose the Inter direction and pure greyscale.
**Rejected:** Soft-warm (Jakarta) and stark-mono (Geist) directions; indigo/teal/oxblood accents — user wants no color.
**Knock-on:** the results graph (branch 2) must distinguish pre/post and the three conditions WITHOUT color — use fill (hollow=pre, solid=post), separate condition lanes, and line style.

## 2. Facilitator results graph (chart type, overlay interaction, stats, scope)
**Decision:** A **dumbbell dot plot** with **4 horizontal lanes** on a 1–10 agreement axis: `pro`, `anti`, `control`, and a pooled **ALL** lane underneath. Each completed participant is a dot. Initial state shows **BEFORE** opinions as **hollow** dots; a single global **"Show after ▸"** toggle reveals **AFTER** opinions as **solid** dots with a thin **connector line per participant** (the shift) and a **mean-shift** readout per lane. Monochrome only: encode before/after by fill, conditions by lane, shift by connector — no color. **Vertical jitter** within each lane so tied scores don't overlap. Keep the existing **exact-numbers table** (n / mean pre / post / shift) below the graph. **Hand-rolled SVG** component, no chart library.
**Scope:** pooled across all runs by default, **plus a run-filter dropdown** to isolate a single session live (lists runs from the existing `/api/admin/runs`). Filtering done client-side on a fetched point set.
**Data:** new admin endpoint returning **per-participant points** `{run_id, run_number, condition, pre, post}` for completed participants only (anonymous — no participant ids needed).
**Reasoning:** the dumbbell makes the directional hypothesis (pro→right, anti→left, control flat) legible at the individual level for small n (~20/condition); the pooled lane gives the headline; the run filter supports a live single-session reveal.
**Rejected:** before/after histograms (loses individuals); pooled-only strip plot (loses the by-condition story, which is the study); a charting library (overkill, fights the bespoke monochrome look).

## 3. PRD / docs update
**Decision:** Four PRD edits: (a) flow step 7 "Debrief…" → **"Submitted — plain thank-you, no on-screen disclosure"**; (b) Ethics → debrief is **facilitator-led, live, to the group after the session** (no on-screen reveal, to stop early finishers tipping off students still chatting); note the student-facing `/debrief` endpoint was removed so conditions can't leak; (c) Admin tooling → add the pre→post **opinion graph** (dumbbell overlay + run filter); (d) Architecture → fix stale line to **React + Vite + bun, custom monochrome CSS** (drop shadcn/TanStack, which were never used).
**Reasoning:** brings the PRD in line with the implemented thank-you screen + facilitator-led debrief decision and the actual stack.

## Terminology
- **Dumbbell plot** — per-participant before/after dots joined by a connector line showing the shift.
- **Lane** — one horizontal 1–10 agreement axis for a group; lanes are `pro`, `anti`, `control`, and pooled **ALL**.
- **BEFORE / AFTER** — pre-rating (hollow dot) and post-rating (solid dot).
- **Show after toggle** — single global control that reveals AFTER dots + connectors across all lanes.

## Open questions / deferred decisions
- **Toggle animation** — connector-line draw / dot-slide transition on "Show after" is nice-to-have polish; ship static first if time-constrained. [self-imposed] → addressed in round 2 below.
- **Empty/early state** — graph with 0–2 completed participants per lane will look sparse; acceptable (it fills as the study runs). [self-imposed]

---

# Round 2 — Opinion-graph enhancements
_Interview held 2026-06-14. Spec: user brief. All R2 branches closed._

Requests: (1) remove the average stat; (2) full-screen / presentation mode for class display; (3) sliding-dot animation on "Show after"; (4) add color to make it more engaging.

## R2.1 Stats to remove / keep
**Decision:** Remove the **μ (mean) values** from the lane stat line **and** the **mean tick lines** (dashed before / solid after) from the SVG. Keep **`n`** and **`Δ` (the shift)** — lane stat becomes `n = 6 · Δ +2.7` (Δ shown only once "after" is revealed).
**Reasoning:** User doesn't want the average surfaced; Δ is the headline result and reads as "shift", not "average", so it stays. Removing the mean ticks declutters the lanes for class display.
**Rejected:** dropping Δ too (loses the key takeaway); keeping μ text (user explicitly rejected).

## R2.2 Full-screen presentation mode
**Decision:** A **"Full screen ⤢" button** on the graph card that expands just the graph (lanes + axis + Show-after toggle + run filter + legend) to fill the viewport via the **native Fullscreen API** on the graph container (CSS fixed-overlay fallback). Larger type/dots in full-screen; Esc/✕ to exit. The **Show-after toggle and run filter remain usable inside** full-screen so the facilitator can reveal the shift live at the projector.
**Reasoning:** native Fullscreen hides OS/browser chrome — cleanest for projecting; keeping controls in-mode is essential for the live reveal.
**Rejected:** CSS-only overlay as the primary (doesn't hide browser chrome); a separate read-only presentation route (controls would be lost).

## R2.3 Show-after animation
**Decision:** On "Show after", each participant's after-dot **starts on its before-dot and slides along the lane to the after position** (~600–800ms, gentle ease-out), with the **connector growing behind it** and a slight **per-row stagger** (cascade). Reversing slides back. Implemented via **CSS transitions on SVG transform/position**, not a JS rAF loop.
**Reasoning:** sliding from the origin makes the shift legible and lively for a class; CSS transitions are smoother and simpler than manual animation; stagger adds dynamism without chaos.
**Rejected:** instant toggle (user wants animation); JS animation loop (unnecessary complexity); fade-in of after-dots (doesn't convey movement/direction).

## R2.4 Colour scheme
**Decision:** Colour scoped to the graph only (rest of app stays monochrome). **Both encodings:** dots coloured **by condition** (pro = teal `#0d9488`, anti = amber `#d97706`, control = indigo `#6366f1`); connector lines coloured **by shift direction** (toward agree = green `#16a34a`, toward disagree = red `#dc2626`, no change = grey `#9498a0`). Before = hollow ring in the condition hue (white fill); after = solid condition hue. In the pooled **ALL** lane, each dot keeps its own condition colour (shows the mix).
**Clutter mitigations** (the busy risk I flagged): connectors drawn **under** dots at ~0.7 opacity and ~2px; dots get a thin white stroke so overlaps separate; compact legend (before ◦ / after ● shape key + ↑green/↓red line key + small pro/anti/control swatch key).
**Reasoning:** user wants maximum visual interest; condition hue gives lane identity even in the pooled lane, direction hue makes persuasion direction pop during the slide reveal.
**Rejected:** condition-only or direction-only (user wants both); colouring the rest of the app (stays monochrome).

---

# Round 3 — Run management (create + delete)
_Interview held 2026-06-14. Spec: user brief. All R3 branches closed._

Requests: (1) the facilitator "Create a run" button is broken — fix it; (2) replace it with a single "Create a new run" button (drop the run-number input); (3) delete past runs via an "✕" button next to each run.

## R3.1 Root cause of the broken button + error handling
**Decision:** The button isn't dead — `CreateRun.create()` has no `try/catch` (unlike every other admin action), so a failed request fails silently. The trigger is the run-number `<input>` reaching `NaN` (cleared field) → `run_number: null` → 422. Dropping the input (R3.2) removes the proximate bug; additionally, the new create handler will route failures to the existing `setError`/error-banner pattern used elsewhere in `AdminApp` so a facilitator sees a failure rather than a dead button.
**Reasoning:** A create call can still fail (network/500) even without the input; a facilitator in front of a class must see that. Two-line change, consistent with the rest of the admin UI.

## R3.2 Create-a-new-run UX (auto-numbering, single button)
**Decision:** Frontend replaces the `Run №` input + "Create" with a single **"Create a new run"** button; the post-create confirmation still shows the run number + join code (how the facilitator reads the code out). Backend makes `run_number` optional in `CreateRunRequest`: when omitted, the server assigns `max(existing run_number) + 1` (or `1` if none); when provided (tests), it is honored.
**Reasoning:** `run_number` is a non-unique display label (real key is the UUID `id`), so `max+1` keeps numbering monotonic while adding and reuse after deleting the highest run is acceptable. Honoring a provided value keeps `test_flow.py` (which POSTs `run_number: 1`) green.
**Rejected:** `count+1` (collides more readily after deletes); keeping the manual number input (the source of the swallowed-NaN bug and the thing the user wants gone).

## R3.3 Delete a run (endpoint, cascade, confirmation, UI)
**Decision:** Hard delete with confirmation. New `DELETE /api/admin/runs/{run_id}` → 404 if missing; in one transaction delete child rows in FK-safe order (messages → ratings → participants → run), return `204`. `RunOut` gains a computed `participant_count` (from `list_runs`). Frontend adds an **"✕"** button beside each run's "Monitor" button; clicking fires a native `window.confirm` ("Delete Run N and its X participants' data? This cannot be undone."), and only on OK calls delete + `refresh()`; if the deleted run's monitor panel is open, it closes. The participant count is also shown inline in the run row.
**Reasoning:** "Delete if needed" implies removing botched/test runs, including ones with data — so empty-only is too restrictive and soft-delete adds exclude-deleted filtering across monitor/results/graph/export for little benefit here. A clear confirm naming the participant count is adequate protection. Explicit ordered child deletes are DB-agnostic (SQLite FK cascade isn't relied upon, and the ORM relationships have no cascade configured). `window.confirm` fits a hand-rolled UI with no modal primitive.
**Rejected:** empty-runs-only (can't remove a botched real run); soft-delete (filtering complexity across every read path + export); custom in-app modal (no existing primitive; native confirm suffices for a destructive action).

## R3 Open questions / deferred decisions
- None — all R3 branches closed. (Noted in R3.2: deleting the highest-numbered run lets the next create reuse that `run_number`; accepted since `run_number` is a display label, not a key.)
