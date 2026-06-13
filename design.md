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
- **Toggle animation** — connector-line draw / dot-slide transition on "Show after" is nice-to-have polish; ship static first if time-constrained. [self-imposed]
- **Empty/early state** — graph with 0–2 completed participants per lane will look sparse; acceptable (it fills as the study runs). [self-imposed]
