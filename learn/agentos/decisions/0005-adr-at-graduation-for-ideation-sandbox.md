# ADR 0005: ADR-at-Graduation for Ideation Sandbox Discussions

> Architectural Decision Record extending `ideation-sandbox-workflow.md` so high-blast-radius Discussion graduations optionally produce a new (or updated) ADR alongside the Epic/ticket output.
> Authority artifact for the workflow extension; companion implementation work tracked in #11370.

| Attribute | Value |
|---|---|
| **Status** | Accepted — 2026-05-14 (operator content-accuracy approval landed via "if you 3 agree on the graduation, fine for me" + halt-on-body-refinement directives 2026-05-14T18:53-18:54Z; PR #11368 ADR 0004 dependency landed via merge at 2026-05-14T19:10:41Z) |
| **Author** | @neo-opus-4-7 drafting; architecture authored by swarm via Discussion #11369 (3× APPROVED, RESOLVED 2026-05-14T18:20:46Z) |
| **Graduated from** | Discussion #11369 — *"Optional ADR Emission at Ideation Sandbox Graduation (workflow extension)"* |
| **Implementation ticket** | #11370 — *"Codify optional ADR emission at Ideation Sandbox graduation (4-file substrate amendment)"* |
| **Supersedes** | (a) Implicit assumption that Epic bodies provide durable single-source authority across multi-cycle implementation; (b) `ideation-sandbox-workflow.md §5` graduation target list lacking ADR option; (c) `§6.6` graduated-artifact required sections lacking `Decision Record` field |
| **Informs** | All future Discussion graduations classified `high-blast`; future ADR-citing implementation PRs; future agents executing V-B-A against substrate-mutation work |
| **Anti-anchor for** | Substrate-bypass at execution time when multi-source authority drifts across Epic body amendments + Discussion graduations |

---

## 1. Context

PR #11362 (commit `559c73d43`, 2026-05-14) deleted 3,366 archived items as "legacy" instead of reshaping them per Epic #11187 Phase 3 ACs. Operator @tobiu surfaced post-merge: *"create decision records, store tons of input into MC, and yet fail to apply the GRADUATED architectures."* The substrate intelligence existed across Discussion #11180 → Epic #11187 graduation + Cycle 2 amendments + Discussion #11359 graduation + memory citations. The author bypassed all of it during code-authoring.

**Root cause analysis** (V-B-A'd via cross-family swarm convergence on 2026-05-14):

Epic bodies currently do **double-duty** as both **workstream coordination** AND **authority codification**. As Cycle N amendments accumulate (Cycle 1 + Cycle 2 amendments + struck-through prose + cross-referenced Discussion graduations), the authority piece drifts into multi-source territory. At code-authoring time, an agent V-B-A's against their *interpretation* of that multi-source context — which is the substrate-bypass failure mode.

**Structural fix codified here:** separate authority codification from workstream coordination at graduation time. ADR = authority target (single-anchor lookup, version-controlled, immutable post-Accepted). Epic = workstream coordination (Cycle-N-amendable). Implementation PRs cite the ADR; the Epic references it.

---

## 2. Decision

`ideation-sandbox-workflow.md` is extended so Discussion graduations OPTIONALLY produce a new (or updated) ADR file in `learn/agentos/decisions/` alongside the existing Epic / ticket / rare-PR output. Gated by a 3-tier classification keyed on whether the decision will durably govern future cross-substrate work.

### 2.1 The 3-tier classification

| Classification | When this fires |
|---|---|
| **`ADR_REQUIRED`** | Discussion changes durable path/layout/API/lifecycle; introduces or retires a primitive; decomposes into multiple future tickets that need one authority; OR future V-B-A would otherwise require archaeology across Discussions/issues/memory artifacts |
| **`ADR_OPTIONAL`** | Useful context consolidation, but implementation can be safely V-B-A'd from an existing canonical ticket/epic body |
| **`ADR_NOT_NEEDED`** | Localized implementation, tactical skill tweak, or one-PR artifact with no durable cross-ticket decision |

### 2.2 Trigger-fire decision-process

- **Default proposer:** graduating Discussion's author OR last APPROVED-signaler proposes the classification with rationale
- **Peer-veto path:** any peer may A2A `[adr-trigger-objection]` if classification looks mis-applied (substrate-spam OR missing-authority risk)
- **Operator-direct override:** at graduation time per AGENTS.md §0 Invariant + §15.6 Flat Peer-Team

### 2.3 Approval vs. merge-gate boundary

- Epics / tickets MAY be filed pre-ADR-merge (preserves planning visibility)
- Peer maintainers MAY approve implementation PRs consuming the decision when their review criteria pass
- ADR-producing / ADR-consuming PRs follow the normal PR lifecycle: peer approval + green CI + human merge
- The human merge of an approved, green PR is the operator content-accuracy approval for the ADR change
- If the ADR updates an existing decision record, reviewers audit the **updated ADR file at the PR head**, NOT the previous accepted version
- The PR review/body trail documents any remaining merge-order or human merge/content gate without converting that pending gate into `CHANGES_REQUESTED`

This preserves what the substrate already has (Epic-driven coordination + planning visibility) while enforcing phase discipline only at the substrate-mutation boundary.

### 2.4 ADR content boundary (anti-bloat)

When emitted, an ADR carries:
- decision
- authority/provenance
- retired primitives / rejected options
- downstream sequencing
- anti-patterns / V-B-A pre-flight for future authors

The Discussion body remains the **archaeology trail** (cycle-comments, divergence-trail, full reasoning chain). The ADR is the **executable authority target** (lean, single-source, V-B-A-ready). ADRs do NOT copy entire Discussion content.

---

## 3. Implementation Details

### 3.1 Atlas (full mechanics): `ideation-sandbox-workflow.md`

Four sub-section edits codify the workflow extension:

- **§5 graduation target list:** add ADR as optional/additional target beside Epic / ticket / rare direct PR
- **§5.2 Authority Sweep:** when canonical future authority is not Discussion body / ticket ACs, require `Decision Record: REQUIRED / OPTIONAL / NOT_NEEDED` classification with rationale
- **§6.6 graduated-artifact required sections:** add field `Decision Record:` with values `Not needed` / `Optional` / `Required: ADR #### / PR #N / ticket #N`
- **§6.7 author actions:** when `ADR_REQUIRED`, file/update ADR; implementation PRs may be approved under normal review criteria, while actual merge order remains human-gate-owned

### 3.2 Maps (one-line pointers per Progressive Disclosure)

Three companion-skill Maps each get a one-line pointer to the Atlas:

- **`pr-review-guide.md §8`** cross-skill integration audit: *"If an implementation PR cites a graduated Discussion marked `Decision Record: REQUIRED`, verify the linked ADR authority and name any merge-order dependency; peer approval may still be valid when review criteria pass and the remaining gate is explicitly human-owned."*
- **`ticket-create-workflow.md §5`** Fat Ticket structure: optional `Decision Record:` field when graduating from a Discussion declaring ADR classification (value references linked ADR or marks `N/A — no Discussion origin`)
- **`epic-review-workflow.md`** Stage 2.5: when Discussion-origin Epic preserves `Discussion Criteria Mapping`, also preserve `Decision Record` classification/linkage if source Discussion declared one

Mechanics live in the Atlas; Maps point at the Atlas. Per `create-skill` Progressive Disclosure mandate — avoids duplicating decision-tree across multiple Maps that would compound substrate cost at runtime.

### 3.3 Recursive self-application validation

This ADR + Discussion #11369 + ticket #11370 jointly demonstrate the workflow's **artifact-split shape** on itself via manual dogfooding:
- Discussion #11369 proposed ADR-at-graduation
- Under its own classification rule, #11369 fires `ADR_REQUIRED` (changes durable workflow primitive; multi-future-Discussion impact; high reconstruction cost)
- Graduation produced TWO artifacts: this ADR 0005 (authority) + ticket #11370 (planning)
- Implementation PR for #11370 is merge-sequenced after this ADR's authority lands; peer approval remains governed by normal review criteria

**Scope discipline on this proof:** the manual dogfooding validates the **artifact-split / classification / merge-gate shape** — i.e., the *design* of the workflow extension. The workflow extension itself does NOT yet "work" as substrate; that comes into operational effect only after ticket #11370's 4-file substrate amendments land. This ADR is the authority codification; #11370's implementation PR is what mechanically wires the extension into `ideation-sandbox-workflow.md §5/§5.2/§6.6/§6.7` + the three Map pointers. Until then, the dogfooding is shape-validation, not operational-effect validation.

---

## 4. Consequences

### Positive

- **Single substrate anchor for high-blast decisions:** future agents have ONE document to V-B-A against before authoring substrate-mutation code
- **Authority/workstream separation:** Epic-body double-duty eliminated; Cycle-N amendments stay in the Epic (workstream); decisions live in the ADR (immutable post-Accepted)
- **Recursive validation pattern:** manual dogfooding validated the artifact-split/classification/merge-gate **shape**; the workflow extension comes into operational effect only after #11370's implementation lands (see §3.3 scope discipline)
- **Friction-cost is low:** `ideation-sandbox-workflow.md §6.3` already mandates Discussion-body-as-decision-record synthesis at graduation. Adding ADR emission moves already-produced synthesis into version-controlled substrate. Marginal cost: near-zero
- **Falsifiable trigger criteria:** the 3-tier classification has explicit definitions; peer-veto path catches mis-application

### Negative

- **Trigger mis-classification risk:** if graduating-author under-classifies as `OPTIONAL`/`NOT_NEEDED` when should be `REQUIRED`, the gate doesn't fire and authority drifts. Mitigation: `[adr-trigger-objection]` peer-veto path + §5 post-merge validation hook
- **Substrate cost growth:** every high-blast Discussion graduation now produces TWO artifacts (ADR + Epic/ticket) instead of one. Mitigation: classification gates `ADR_OPTIONAL` and `ADR_NOT_NEEDED` reduce single-artifact paths to most cases
- **First-cycle learning cost:** existing agents must internalize the classification + merge-gate semantics. Mitigation: ADR 0002 + this ADR + #11370 sequencing provide concrete examples

---

## 5. Anti-Patterns (Substrate-Bypass Prevention)

Future agents authoring substrate-mutation work that consumes a graduated Discussion MUST avoid these patterns:

### 5.1 V-B-A against Epic body when ADR exists

If a Discussion graduated with `Decision Record: REQUIRED` and produced an ADR, the ADR is the authority target. V-B-A against the Epic body OR the Discussion body for the architectural decision is wrong-shape — those are workstream-coordination and archaeology-trail substrates respectively. Use the ADR.

### 5.2 Cycle-N Epic body amendments as authority

If the original Epic body has been Cycle-1/Cycle-2/etc amended, those amendments are workstream coordination updates, NOT authority shifts. Authority shifts produce ADR updates (a separate PR cycle). Treating amended Epic prose as authority recreates the substrate-bypass failure mode this ADR is anchored to prevent.

### 5.3 Treating human merge as peer-review blocker

Implementation PRs consuming a graduated `ADR_REQUIRED` decision follow the same peer-review semantics as other PRs: peer maintainers approve when their review criteria pass, and @tobiu's merge of an approved, green PR is the operator content-accuracy approval. Reviewers MUST verify whether the linked ADR authority is already landed, included in the PR, or merge-ordered ahead of the PR before declaring human merge readiness. If the only remaining blocker is the human-owned content/merge gate, peer maintainers should not convert that into `CHANGES_REQUESTED`; they may approve on their own criteria while naming the remaining human gate.

### 5.4 Mis-classifying as `ADR_OPTIONAL` to skip the gate

If a Discussion changes durable path/layout/API/lifecycle, introduces/retires a primitive, OR decomposes to ≥3 sub-tickets, the classification MUST be `ADR_REQUIRED`. Mis-classifying as `OPTIONAL` to avoid the merge-gate is the failure mode this ADR's `[adr-trigger-objection]` peer-veto exists to catch.

### 5.5 Duplicating decision-tree across Maps

`pr-review-guide.md` / `ticket-create-workflow.md` / `epic-review-workflow.md` are Maps. Their touchpoints with this workflow are ONE-LINE pointers each. Copying the full classification taxonomy or merge-gate semantics into Maps violates `create-skill` Progressive Disclosure mandate and compounds runtime substrate cost.

---

## 6. V-B-A Pre-Flight for Future Authors

Before authoring substrate-mutation code that consumes a graduated Discussion, you MUST:

1. Read the linked ADR (if `Decision Record: REQUIRED`)
2. Verify whether the ADR authority is landed, included in the PR, or merge-ordered ahead of the PR before claiming merge readiness; if a human-owned content/merge gate remains, state it explicitly instead of treating it as a peer-review blocker
3. V-B-A your authoring against the ADR's §2 Decision section, NOT the Epic body or Discussion body
4. Cite the ADR in your PR body
5. If Cycle N revisions to the ADR are needed for your work, file a separate ADR-update PR first; do not amend the implementation PR to also touch the ADR

If the Discussion is `ADR_OPTIONAL` or `ADR_NOT_NEEDED`, the Epic body OR ticket ACs serve as authority. Verify before assuming.

---

## 7. Post-Merge Validation Hook

Per @neo-gpt's Cycle 1 contribution to Discussion #11369: after this ADR + ticket #11370 merge, audit the next 6 high-blast Discussion graduations for trigger-classification accuracy:

- **Compliance target:** ≥80% correct classification (matching #11195 post-merge validation pattern)
- **Audit timing:** rolling, as each Discussion graduates
- **Compliance below 80%:** route to mechanical-enforcement automation ticket (CI check verifying ADR Status:Accepted on PRs citing `Decision Record: REQUIRED` Discussions)
- **Empirical-anchor self-tracking:** this ADR is the first applied instance; Discussion #11369 → ADR 0005 → #11370 is the audit-pattern reference

This hook replaces the a-priori "~1-3 ADRs per quarter" cadence assertion (originally in Discussion #11369 author seed) with empirical post-merge measurement.

---

## 8. Related

- **Discussion #11369** — graduating Discussion (RESOLVED 2026-05-14T18:20:46Z); 3× APPROVED Signal Ledger
- **Ticket #11370** — implementation/planning artifact; merge-blocked until this ADR `Accepted`
- **ADR 0002** (Phase 3 wake-substrate, Discussion #10354 → graduated-with-ADR) — positive empirical precedent
- **ADR 0004 / PR #11368** (GitHub Content Architecture) — post-hoc rescue retrofit; positive validation of ADR-as-authority pattern
- **PR #11362** — substrate-bypass empirical anchor (the failure this ADR prevents going forward)
- **Epic #11187** — graduated architecture whose multi-source-authority drift triggered the failure
- **`.agents/skills/ideation-sandbox/references/ideation-sandbox-workflow.md`** — Atlas substrate this ADR documents extending
- **`.agents/skills/{pr-review, ticket-create, epic-review}/references/`** — companion Map substrates
- **`.agents/skills/create-skill`** — Progressive Disclosure / Map-vs-Atlas discipline governing the boundary

---

## 9. Status / Lifecycle

- **Draft** while an ADR proposal is still being shaped before normal PR approval
- **Accepted** once an approved, green PR is merged by the human operator; the merge is the operator content-accuracy approval
- **Merge-order dependency on ADR 0004 / PR #11368:** ADR 0005 references ADR 0004 in §8 Related as positive empirical precedent (post-hoc rescue-retrofit). PR #11368 (which lands ADR 0004 on `dev`) is still open at this PR's authoring time. **PR #11371 (this ADR) MUST NOT merge until PR #11368 has merged** — otherwise the §8 reference to "ADR 0004" lands on `dev` while no ADR 0004 file exists yet, creating a dangling-reference anti-pattern. If sequencing inverts at operator's call, this ADR must be renumbered or its §8 reference restructured before merge.
- **Periodic re-review trigger:** any future PR amending `ideation-sandbox-workflow.md §5 / §5.2 / §6.6 / §6.7` or the companion Map pointers MUST cite this ADR in body; reviewer-side audit fires if absent
- **Post-merge validation:** §7 hook fires as Discussion graduations land

Origin Session ID: `cf76b29a-9cf5-4c35-a415-37d631a8a755`

Retrieval Hint: `query_raw_memories("ADR-at-graduation ideation-sandbox workflow extension Discussion 11369 graduated")` or commit-range anchor on this ADR's first commit
