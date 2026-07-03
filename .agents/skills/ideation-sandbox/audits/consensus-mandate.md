# Consensus-Mandate Audit Reference

*(Sub-rule extraction from `ideation-sandbox-workflow.md` "Graduation Trigger (Consensus-Gated)" per #11319 / #11320 byte-budget discipline. Load this file when you need the graduated-artifact template block, two-axis substrate details, empirical anchors for the consensus mandate, or the 30-day post-merge validation framing. The main `../references/ideation-sandbox-workflow.md` graduation section carries the operational rule; this file carries reference-grade context that loads on-demand.)*

## §quorum-rule — Family-Keyed Quorum Rule (full rationale)

`../references/ideation-sandbox-workflow.md` "Signal Patterns + Quorum Rule" carries the operational rule; this section carries the full rationale + background.

**Quorum rule** (per Epic #11796 / Discussion #11793 — family-keyed, membership-derived):

- **(a) Floor-2 (all tiers):** ≥ 2 distinct *active* families (per `AgentIdentity.participationStatus` in `ai/graph/identityRoots.mjs`) carry ANY signal type (`AUTHOR_SIGNAL` or `[GRADUATION_APPROVED]`).
- **(b) Non-author endorsement (all tiers):** ≥ 1 *non-author* active family carries `[GRADUATION_APPROVED]`. `AUTHOR_SIGNAL` from the author's family is necessary for family coverage but never sufficient on its own.
- **(c) Tier 2** (core-value / §critical_gates / consensus-gate mutations) additionally requires explicit `## Unresolved Liveness` entry for any benched family + capability-grounded `revalidationTrigger` AC in the graduating Epic (per `../references/ideation-sandbox-workflow.md` "Graduated-Artifact Required Sections").

Family-keying replaces the prior hardcoded "3× cross-family signals" — the count was a snapshot of fixed swarm membership, while the active membership is variable (operator-benched families, same-family siblings). Same-family aggregation (documented in §same-family-aggregation below) determines a family's contributed signal when multiple identities of one family are active.

## §same-family-aggregation — Multi-Identity Family Resolution (full rule)

This section carries the full same-family aggregation rule.

When a family has multiple active identities (e.g., `claude` with both `@neo-opus-ada` and `@neo-opus-grace`), that family contributes `APPROVED` when **(a) ≥ 1 active identity in the family has posted `[GRADUATION_APPROVED]` at the current body anchor**, AND **(b) no active identity in that family holds an unresolved `[GRADUATION_DEFERRED]` or `[GRADUATION_VETO]` at the same anchor**. Any unresolved same-family `DEFERRED`/`VETO` blocks that family until reconciled. The burden-of-convergence clause applies to same-family APPROVED-signalers as well as cross-family ones. This preserves same-family challenge pressure without double-counting the family.

## §template-block — Graduated-Artifact Required Sections (canonical markdown)

The graduated Issue / Epic / PR body MUST include the four `## Signal Ledger` + `## Unresolved Dissent` + `## Unresolved Liveness` + `## Discussion Criteria Mapping` sections per `../references/ideation-sandbox-workflow.md` "Graduated-Artifact Required Sections". Canonical template (post-Epic #11796 family-keyed rule):

```markdown
## Signal Ledger
- `claude`: [AUTHOR_SIGNAL | APPROVED | DEFERRED | ABSTAIN] by @<identity> @ <anchor>
- `gpt`: [APPROVED | DEFERRED | ABSTAIN] by @<identity> @ <anchor>
- `gemini`: [APPROVED | DEFERRED | ABSTAIN] by @<identity> @ <anchor>
(multi-identity-per-family case: nest identity rows under the family row with one signal each; family-of-record signal follows same-family aggregation)
(AUTHOR_SIGNAL only appears under the author's family — it covers family coverage but not independent peer endorsement)

## Unresolved Dissent
(empty if no DEFERRED/VETO at the final body anchor — positive signal)
(otherwise: each DEFERRED/VETO with reason + STATUS: resolved-by-peer-reconciliation <anchor> OR pending-reconciliation)

## Unresolved Liveness
(empty if all active families produced a signal — positive signal)
(otherwise: each inactive/no-signal family with participationStatus + reactivationTrigger + STATUS: pending-peer-repoll OR peer-owned liveness disposition <anchor>)
(Tier-2 graduations: include the revalidationTrigger AC reference for the graduating Epic — per the Tier 2 quorum rule)

## Discussion Criteria Mapping
(required for Epics graduating from a Discussion to satisfy `epic-resolution` Closeout Gates)
- Criterion 1 from Discussion -> AC X
- Criterion 2 from Discussion -> AC Y (or Deferred to #Z)
```

## §signal-patterns-table — Full Signal Pattern Definitions

The four signal patterns recognized at high-blast graduation (`../references/ideation-sandbox-workflow.md` "Signal Patterns + Quorum Rule" carries the inline bullet summary):

| Signal | Effect on graduation | Definition |
|--------|----------------------|------------|
| `[GRADUATION_APPROVED by @<peer> @ <anchor>]` | Satisfies this family's non-author endorsement contribution (per same-family aggregation) | Peer endorses substrate at specific version anchor |
| `[GRADUATION_DEFERRED by @<peer> @ <anchor> — <reason>]` | **BLOCKS** until withdrawn-post-reconciliation OR peer-owned resolution path is explicitly documented; same-family `DEFERRED` blocks that family per same-family aggregation | Peer holds substantive concern; reconciliation cycle needed |
| `[GRADUATION_ABSTAIN by @<peer> @ <anchor>]` | **NOT approval**; counted against floor-2 only as a non-APPROVED signal; if no active family produces an `APPROVED`, graduation is blocked | Peer explicitly passes on this Discussion |
| `[AUTHOR_SIGNAL by @<author> @ <anchor>]` | Satisfies *family coverage* for the author's family; does **NOT** count as independent peer endorsement; required when author is the only active identity of their family | Author signs their own Discussion's body at a specific anchor to cover the author-family's quorum representation |

**VETO collapse rule** (sub-rule of `DEFERRED`): A VETO requires either (a) an alternative-implementation proposal OR (b) a V-B-A-falsifier of the proposing peer's claims. Pure "I disagree" without one of these collapses to DEFERRED. Aligns with `pr-review §9.1 Reviewer-Yield Protocol`.

## §version-binding-examples — Signal Anchor Examples

Canonical examples of the `[<SIGNAL> by @<peer> @ <anchor>]` syntax used in version-binding:

- `[GRADUATION_APPROVED by @neo-opus-4-7 @ DC_kwDODSospM4BAZOz]` — bound to specific comment.
- `[GRADUATION_APPROVED by @neo-gpt @ Cycles 4+5+6]` — bound to cycle-comment range.
- `[GRADUATION_DEFERRED by @neo-gpt @ body updatedAt 2026-05-11T14:56Z — needs scope narrowing]` — bound to body timestamp.
- `[AUTHOR_SIGNAL by @neo-opus-4-7 @ body updatedAt 2026-05-22T23:13:11Z]` — author signs Discussion #11793 Cycle-2.6 body for `claude` family-coverage (the empirical anchor that produced this rule).

## §axis-substrate — Two-Axis Substrate: Discussion-Graduation + PR-Merge

The Consensus Mandate is **Axis 1** (Discussion-graduation-gate). The companion **Axis 2** (PR-merge-gate) is codified in `pull-request-workflow.md` "Consensus-Gate". Both axes operationalize the operator's "premature PRs → reject" directive (2026-05-11):

- **Axis 1**: graduation BLOCKED if Signal Ledger incomplete per the quorum rule.
- **Axis 2**: PR-merge BLOCKED if PR opened from non-graduated Discussion.

Without both axes, the consensus-mandate is bypassable. Cross-family reviewer MUST verify signal-ledger at PR-review time per Axis 2.

## §empirical-anchors — Consensus-Mandate Empirical Anchors

- **Discussion #11216** — the consensus-mandate proposal itself; graduated under its own dogfooded protocol after 8 cycle-comments + 3 definitional-flaw discoveries (Cycle 4 loose-positives → Cycle 5 scope-narrowing → Cycle 6 strict-semantics). Recursive substrate validation: the protocol proved its own correctness by running through itself.
- **Discussion #11210 → #11213** — sunset scope split. Author Gemini unilaterally graduated at ~14:26Z; @tobiu rejected at merge-gate (~14:27Z) and again at ~14:37Z (PR #11212 + first PR #11215 iteration). Anchor for both axes.
- **Discussion #11214 → #11218** — Decision Escalation Ladder. Graduated under #11216 protocol-in-flight via dogfooding; demonstrates AC11 Signal Ledger format in Issue body.
- **PR #11212 + PR #11215** — load-bearing PR-merge-gate empirical anchors; operator rejections demonstrate Axis 2 enforcement.
- **Discussion #11782 → Epic #11731** — first empirical hit of the §6.2 hardcoded-3× failure mode: graduated on 2 active cross-family signals (`@neo-opus-4-7` + `@neo-gpt`) plus a documented Gemini liveness gap, via a one-off Tier-4 operator escalation because no standing active-peer-quorum rule existed. The friction that originated Discussion #11793.
- **Discussion #11793 → Epic #11796** — the active-peer-quorum rule itself; graduated under its own dogfooded protocol across Cycles 1 → 2 → 2.5 → 2.6 → 3. Recursive substrate validation depth-2: a rule about how rules graduate, graduating under the rule it proposes. Signal ledger: `claude.AUTHOR_SIGNAL` (`@neo-opus-4-7`, the author's family) + `gpt.[GRADUATION_APPROVED]` (`@neo-gpt`, the non-author family) + `gemini.Unresolved-Liveness` (`@neo-gemini-3-1-pro`, `operator_benched` with capability-grounded `reactivationTrigger`). Floor-2 ✓; non-author-APPROVED ≥ 1 ✓; Tier-2 revalidation hook carried by Epic #11796 AC6. No operator override required.

## §post-merge-validation — 30-Day Post-Merge Validation (AC10)

Per #11195 30-day Step 2.5 validation tracker, the consensus-mandate substrate's compliance is audited prospectively:
- Next 3 high-blast Discussion graduations: signal-ledger compliance (AC1-5, AC11)
- Next 3 PRs from Discussion graduations: PR-merge-gate cite-compliance (AC6)
- If compliance-rate < 80% at Day-30: route to mechanical-enforcement automation ticket per #11195 escalation path

## §author-actions — Author Actions Post-Consensus (full sequence)

When the Signal Ledger reaches the quorum rule (floor-2 + non-author-APPROVED ≥ 1; Tier 2 also requires `## Unresolved Liveness` + `revalidationTrigger` AC), the author executes the following sequence:

1. Add `[GRADUATED_TO_TICKET: #N]` marker near top of Discussion body (per `../references/ideation-sandbox-workflow.md` "Iterative Review Workflow" OQ-resolution-tag pattern).
2. Update body with `## Signal Ledger` + `## Unresolved Dissent` + `## Unresolved Liveness` + `## Discussion Criteria Mapping` sections (template per §template-block above).
3. File resulting Epic / ticket / PR with cross-references back to Discussion + each peer's GRADUATION signal commentId.
4. Formally close Discussion via GraphQL `closeDiscussion(reason: RESOLVED)`.

The closed Discussion remains the archaeological source; the linked artifact becomes actionable. **The cycle-comments archive as the divergence-trail.**

**Precondition for the sequence** (codified in `../references/ideation-sandbox-workflow.md` "Author Actions Post-Consensus"): if the author's family has no other active identity, the author posts `[AUTHOR_SIGNAL]` at the current body anchor BEFORE the final non-author-APPROVED poll. Without it, floor-2 cannot be reached when only one non-author family is active.
