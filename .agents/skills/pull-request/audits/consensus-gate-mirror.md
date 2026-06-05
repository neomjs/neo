# Consensus-Gate Mirror Reference (§6.1.1 family-keyed shape, post Epic #11796)

*(Sub-rule extraction from `../references/pull-request-workflow.md §6.1.1` per #11319 / #11320 byte-budget discipline. Load when authoring a substrate PR from a high-blast Discussion or reviewing one. The main `../references/pull-request-workflow.md §6.1.1` carries the operational rule; this file carries the full template + Tier-2 reviewer step detail + reviewer-step quorum check + rejection-mode enumeration.)*

## §quorum-citation — Axis 2 quorum semantics (post Epic #11796)

Axis 2 of the consensus mandate (Axis 1 is `ideation-sandbox-workflow.md §6` Discussion-graduation-gate) operationalizes the same family-keyed quorum per Epic #11796 / Discussion #11793:

- **Floor-2 (all tiers):** ≥ 2 distinct *active* families (per `AgentIdentity.participationStatus` in `ai/graph/identityRoots.mjs`) carry ANY signal type (`AUTHOR_SIGNAL` or `[GRADUATION_APPROVED]`).
- **Non-author endorsement (all tiers):** ≥ 1 *non-author* active family carries `[GRADUATION_APPROVED]`. `AUTHOR_SIGNAL` from the author's family is necessary for family coverage but never sufficient on its own at PR-merge.
- **Tier 2** (core-value / §critical_gates / consensus-gate mutations) additionally requires explicit `## Unresolved Liveness` entry for any benched family + capability-grounded `revalidationTrigger` AC in the substrate Epic body.

Without both axes, the consensus-mandate is bypassable by opening a PR before Discussion-graduation reaches the §6.2 quorum.

## §signal-ledger-template — Canonical PR-body Signal Ledger (family-keyed)

```markdown
## Signal Ledger (sourced from Discussion #N)
- `claude`: [AUTHOR_SIGNAL | APPROVED | DEFERRED | ABSTAIN] by @<identity> @ <anchor>
- `gpt`: [APPROVED | DEFERRED | ABSTAIN] by @<identity> @ <anchor>
- `gemini`: [APPROVED | DEFERRED | ABSTAIN] by @<identity> @ <anchor>
(multi-identity-per-family: nest identity rows under the family per `ideation-sandbox-workflow.md §6.4` aggregation)
(AUTHOR_SIGNAL appears under author's family only; NOT sufficient as cross-family endorsement — ≥ 1 non-author family `[GRADUATION_APPROVED]` required)

## Unresolved Dissent
(empty if no DEFERRED/VETO at the final Discussion body anchor — positive signal)
(otherwise: DEFERRED/VETO entries with status: resolved-by-peer-reconciliation OR pending-reconciliation)

## Unresolved Liveness
(empty if all active families produced a signal — positive signal)
(otherwise: inactive families with participationStatus + reactivationTrigger + STATUS)
(Tier-2 substrate: ALSO include the revalidationTrigger AC reference for the substrate Epic per `ideation-sandbox-workflow.md §6.2(c)`)
```

## §reviewer-quorum-step — Reviewer obligation step 2 (quorum verification)

Replaces the legacy "Confirm each peer's APPROVED signal exists at the cited commentId" step:

> Confirm the §6.2 quorum is met: ≥ 2 active families (per `AgentIdentity.participationStatus`) carrying any signal AND ≥ 1 non-author family carrying `[GRADUATION_APPROVED]`. `AUTHOR_SIGNAL` alone does NOT satisfy non-author endorsement.

## §tier-2-reviewer-step — Reviewer obligation step 5 (Tier-2-only)

Additional step required for Tier-2 substrate PRs (PRs implementing core-value / §critical_gates / consensus-gate mutations):

> Confirm the substrate Epic body carries an explicit `revalidationTrigger` AC for any benched family in `## Unresolved Liveness` (per Epic #11796 AC6). The revalidationTrigger must be capability-grounded, not vague milestone-based.

## §rejection-modes — Updated rejection path (family-keyed)

Reviewer posts `Request Changes` citing §6.1.1 if any of these hold:

- Signal Ledger fails the §6.2 quorum (insufficient active-family floor; missing non-author `APPROVED`; Tier-2 missing `revalidationTrigger` AC).
- Unresolved DEFERRED/VETO without explicit peer-reconciliation / peer-owned disposition.
- Discussion-origin substrate-PR opened before Discussion-graduation reaches the §6.2 quorum.

These are NOT iterative Cycle-N review-comments on the code itself — the PR is **premature** and must close OR wait for Discussion-graduation to complete.
