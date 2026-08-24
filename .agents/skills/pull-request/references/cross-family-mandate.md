# Cross-Family Mandate — rationale and exceptions

*(Sub-rule extraction from `pull-request-workflow.md` §6.1 per the Map-vs-Atlas
byte-budget discipline. The map carries the operative rule; load this when
invoking an exception or questioning the rule's shape.)*

## Why a difference test, not a list of families

The mandate used to name families: `(Claude-family <-> Gemini/GPT-family)`. Accurate
when the roster held three, and nothing failed when it stopped being true — by
2026-08-24 it named the one **benched** family and omitted two others, one of
them the only live third seat. An enumeration claims completeness, needs
hand-editing on every roster change, and goes stale silently. **If you are
tempted to list the current families to make the rule concrete, that is the
failure mode this file exists to prevent.**

## `unknown` counts as differing — and what it costs

A seat may record `modelFamily: 'unknown'`: an engine undisclosed by design,
where the bearer does not know its own model or vendor. Operator ruling
2026-08-24 — it counts as differing.

The trade should not be quietly enjoyed: a family nobody can state cannot be
*shown* uncorrelated with the author's, so admitting it assumes part of what the
mandate checks. A usable third seat, bought with a guarantee that was never
verifiable for that seat.

**Never infer a family from a handle, a preview codename, or a rumour** — the
record is the only citation, and `unknown` is an accurate value, not a gap to
fill. Two maintainers misread that placeholder within one hour on 2026-08-24,
one as "not Claude", the other as a gap to close.

## Liveness is not consulted

The gate asks what an approval **was**, not who is available now. A benched
peer's past approval was still cross-family, and the correlated-blind-spot
rationale is satisfied by *who reviewed*. Requiring live seats would couple merge
validity to a hand-maintained roster file whose participation rows go stale.

## Exceptions

Narrow, and each must be stated in the PR/review thread:

- **Micro-change:** `chore` and `< 20` changed lines, or pure documentation with
  no runtime impact.
- **7-day-open fallback:** PR open >= 7 days and no cross-family thread
  engagement; cite `createdAt` and `get_conversation` evidence.
- **Emergency:** `priority: P0` or explicit Tobi override; retrospective
  cross-family review within 7 days.

If CI is green and no cross-family reviewer has engaged after ~2 hours, invite
exactly one opposite-family primary reviewer before considering fallback.

Merge-readiness marker vocabulary lives with its consumers, not here:
`../../pr-review/references/pr-review-guide.md` and
`../../post-review-pickup/references/post-review-pickup-workflow.md`.
