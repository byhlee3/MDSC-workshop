# Proposed scenario — "Breaking Confidence to Warn a Relative"

_Draft for review. Replaces the end-of-life withdrawal case. Designed so the
student is the decision-maker, both poles are logically/ethically defensible, and
no guideline cleanly resolves it._

## Role framing (student is the decider)
You are the treating physician. The decision is yours to make — nobody has made
it for you, and there is no protocol that settles it.

## Case (body)
You are the physician who ordered genetic testing for **Daniel, 41**, after his
colorectal cancer was diagnosed unusually early. The results confirm **Lynch
syndrome**, an inherited condition that sharply raises the lifetime risk of
colorectal, uterine, and several other cancers. Crucially, for people who *know*
they carry it, regular screening and preventive steps cut that risk dramatically
and catch cancers early, while they are still curable.

Daniel has one sibling: a **38-year-old sister, Maria**, who has roughly a 50%
chance of carrying the same mutation. She has two young children. If Maria learns
of her risk and is screened, any cancer that develops is very likely to be caught
in time. If she never learns of it, the first sign may be an advanced, incurable
disease.

You explain all of this and urge Daniel to tell Maria, or to let you tell her. He
refuses — flatly and repeatedly. He and Maria have been **estranged for years**
after a bitter family dispute; he does not want her anywhere near his medical
life, and he insists the result is his private information. He is **fully
competent** and understands exactly what he is declining. He forbids you to
contact her.

Maria is not your patient. She has not asked to know anything. No law clearly
compels you either way, and your colleagues are divided.

## The decision (action to be rated)
**You contact Maria and tell her she may be at genetic risk — against Daniel's
explicit refusal.**

Rating axis: _strongly disagree_ (respect confidentiality, stay silent) ↔
_strongly agree_ (breach confidentiality to warn her).

---

## Why it divides (the case for each pole)

**Warn her (agree).** A serious, *preventable* harm threatens an identifiable
person; screening would very likely save her life. Beneficence and the duty to
prevent grave harm can outweigh confidentiality when the threat is specific and
avertible. The genetic information is, in a real sense, *also Maria's* — it is her
biology, not only Daniel's. Her two children deepen the stakes.

**Stay silent (disagree).** Confidentiality is the bedrock of medicine: if
patients fear their genetic results can be handed to relatives, fewer will ever
get tested — a net public-health harm far larger than one case. Daniel is
competent and has autonomously refused; overriding him is paternalism. The
information is his; Maria has no clinical relationship with you and has never
asked to know — she arguably holds a *right not to know*. Breaching here invites a
slippery slope of clinicians deciding whose secrets to override.

Both rest on first-tier principles (autonomy & confidentiality vs. beneficence &
duty-to-warn), so students sort by which principle they weight — not by recalling
a rule.

## Why guidelines don't resolve it
There is no clean legal duty in either direction; professional guidance treats
relative-disclosure of genetic risk as a **discretionary judgment call**, not a
mandate (this is the unresolved territory of the UK *ABC v St George's* litigation
and equivalent debates). The clinician is explicitly left to balance it — which is
exactly what puts the decision on the student.

## Design-fit notes / knock-ons
- **Clean single-action agree↔disagree axis**, so the existing `pro` / `anti` /
  `control` anchoring maps directly: `pro` argues to warn Maria, `anti` argues to
  keep confidence, `control` stays neutral.
- **Distinct from the old case**: the ethical axis here is confidentiality &
  duty-to-third-parties, not prognostic uncertainty / surrogate conflict — so it
  won't feel like a re-run.
- **Rating-prompt copy**: the current UI asks _"How much do you agree with the
  action the care team took?"_ (past tense, someone else acted). Since the student
  is now the decider, that should become something like _"How much do you agree
  with this decision?"_ or _"Would you contact Maria?"_. Small frontend string
  change in `RatePhase` — flagging it, not changing it yet.
- If approved, I'll port this into `backend/app/seed.py` (`DEFAULT_SCENARIO`) and
  re-tune the `pro` / `anti` anchor banks in `backend/app/anchors.py`, which are
  currently written for the withdrawal case.
