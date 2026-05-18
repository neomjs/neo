# ADR 0011: Substrate Numbering Convention

> Architectural Decision Record defining semantic-anchor reference identity for live agent instruction substrate. Authority artifact for Epic #11558 / ticket #11559; downstream migration and lint work are tracked separately.

| Attribute | Value |
|---|---|
| **Status** | Proposed — 2026-05-18 (transitions to Accepted on approved, green PR merge by the human operator) |
| **Author** | @neo-gpt drafting; architecture authored by swarm via Discussion #11557 |
| **Graduated from** | Discussion #11557 — *"Substrate-numbering convention after byte-budget compaction (AGENTS.md + AGENTS_ATLAS.md)"* |
| **Implementation ticket** | #11559 — *"Author semantic-anchor policy ADR"* |
| **Parent epic** | #11558 — *"Substrate Numbering Semantic Anchor Migration"* |
| **Supersedes** | Positional section identity for live instruction substrate (`§N` references as durable targets) |
| **Informs** | #11560 lint guard; #11561 AGENTS / ATLAS migration; #11562 skill migration; #11564 ADR and documentation migration |
| **Anti-anchor for** | Contiguous renumbering, position-preservation as permanent policy, and rewriting ADR 0007's historical baseline as mutable policy clay |

---

## 1. Context

`AGENTS.md` and `AGENTS_ATLAS.md` originally used positional section numbers as compact references. Successive byte-budget compaction passes, especially the ADR 0007 compaction taxonomy work, intentionally moved or retired sections. The result is a fragmented "swiss-cheese" numbering pattern.

The positional convention became structurally load-bearing because live skill files, workflow references, ADRs, and agent handoffs cite `§N` targets. Once numbering is fragmented and mutable, a reference such as `AGENTS.md §21` no longer represents stable semantic identity. It represents a current file position that can drift during the next compaction.

Discussion #11557 selected **Option C globally**: migrate live instruction substrate from positional `§N` identity to stable semantic anchors. Gemini's canonical Step 2.5 sweep marked path determinism, state mutability, and active-vs-archive handling as real correctness dimensions, with migration blast radius handled by explicit child tickets under Epic #11558.

ADR 0007 remains the historical authority for the compaction taxonomy. This ADR does not rewrite ADR 0007. It defines the successor reference-identity convention for live substrate after the taxonomy has made positional numbering too fragile.

---

## 2. Decision

Live instruction substrate MUST use stable semantic anchors as durable reference identity. Positional `§N` references are deprecated as live targets.

### 2.1 Semantic anchor identity

A semantic anchor is an explicit, immutable, kebab-case identifier that names the concept being referenced rather than the section's current position.

Recommended shape:

```md
<a id="mailbox-check-protocol"></a>
## 22. The Mailbox Check Protocol
```

References target the semantic anchor, not the section number:

```md
[Mailbox Check Protocol](../../AGENTS.md#mailbox-check-protocol)
```

The visible heading MAY keep its current numeric prefix during incremental migration, but the number is no longer the identity primitive.

### 2.2 Anchor immutability and aliases

Once a semantic anchor is introduced, the anchor ID is immutable for live references. If a section is renamed, split, moved, or compacted, existing anchor IDs MUST be preserved as aliases unless the reference is explicitly retired.

Alias shape:

```md
<a id="old-anchor-id"></a>
<a id="new-anchor-id"></a>
## New Heading Text
```

Heading text may evolve for clarity. Anchor IDs do not silently change with heading text.

### 2.3 Active vs. historical references

Active/live instruction references migrate to semantic anchors. This includes references whose consumer is a current agent, skill, workflow, CI guard, PR review, or ticket-intake path.

Historical/archaeology references MAY preserve original `§N` wording when the number is part of the historical record being described. Such references should be visibly classified as historical, archaeology, or errata when ambiguity is likely.

Examples:

- Live: "Use [Mailbox Check Protocol](../../AGENTS.md#mailbox-check-protocol)."
- Historical: "ADR 0007 recorded the old `§21` disposition at the time of compaction."

### 2.4 Lint and migration partitioning

This ADR defines policy only. Enforcement and migration are separate child tickets under Epic #11558:

- #11560 adds lint / CI enforcement for new live positional references.
- #11561 migrates `AGENTS.md` and `AGENTS_ATLAS.md`.
- #11562 migrates `.agents/skills/**`.
- #11564 migrates ADR and general documentation references.

The partitioning is part of the decision: semantic-anchor migration is global in policy, but implementation remains bounded by substrate layer so review and revert paths stay legible.

---

## 3. Rationale

### 3.1 Why not contiguous renumbering

Contiguous renumbering fixes the cosmetic symptom once and recreates the same decay class on the next compaction. It also generates churn in references that did not semantically change.

### 3.2 Why not position-preservation

Position-preservation codifies the fragmented numbering pattern as permanent substrate. That preserves LLM parsing cost across every turn and every future session, which is worse than paying the one-time migration cost.

### 3.3 Why not mutate ADR 0007

ADR 0007 is the historical authority for the compaction taxonomy. Rewriting its baseline table would damage archaeology and hide the actual decision sequence. This ADR layers a successor convention on top of ADR 0007 instead.

### 3.4 Why explicit anchors instead of generated heading anchors

Generated Markdown heading anchors are tied to heading text and renderer rules. Explicit IDs are renderer-stable, grep-friendly, and independent from future wording changes.

---

## 4. Consequences

### Positive

- Live references survive section movement, heading edits, and compaction.
- Agents can V-B-A a reference target by semantic meaning instead of mutable position.
- Lint can mechanically prevent recurrence of new live `§N` targets.
- Historical references remain preservable without pretending they are active routing anchors.

### Negative

- Initial migration touches many files.
- Authors must choose stable semantic IDs and preserve aliases on rename.
- The substrate temporarily carries both numeric headings and semantic anchors until migration children land.

---

## 5. Anti-Patterns

### 5.1 Blind global search-and-replace

Replacing every `§N` occurrence mechanically is wrong. Active references and historical references have different semantics. Run the active-vs-archive classification first.

### 5.2 Anchor IDs derived from volatile heading prose

Do not use raw generated heading anchors as the durable identity unless the heading text itself is immutable. Semantic IDs should be short, explicit, and preserved through heading rewrites.

### 5.3 Retiring aliases during cleanup

Removing an old anchor alias because it looks redundant breaks historical PRs, tickets, comments, and handoffs. Alias removal requires an explicit retirement rationale.

### 5.4 Bundling policy, lint, and migration in one PR

This ADR is the policy authority. Lint and migration are downstream children. Bundling them would make review noisy and obscure whether the policy itself is accepted.

---

## 6. V-B-A Pre-Flight for Future Authors

Before modifying live substrate references under Epic #11558 or successors:

1. Read this ADR and ADR 0007.
2. Classify each reference as active/live or historical/archaeology.
3. For active references, target a semantic anchor.
4. For historical references, preserve the historical wording or add an explicit errata/classification note.
5. Preserve existing semantic anchor IDs as aliases when headings move or rename.
6. Cite this ADR in PR bodies that add, migrate, lint, or retire live substrate references.

---

## 7. Related

- Discussion #11557 — Option C global semantic-anchor migration
- Epic #11558 — Substrate Numbering Semantic Anchor Migration
- Ticket #11559 — ADR authoring ticket
- Ticket #11560 — Semantic-anchor lint guard
- Ticket #11561 — AGENTS / ATLAS migration
- Ticket #11562 — Workflow skill migration
- Ticket #11564 — ADR and docs migration
- ADR 0005 — ADR-at-Graduation workflow
- ADR 0006 — ADRs as graph-queryable entities
- ADR 0007 — Compaction Taxonomy
- ADR 0008 — Skill Anatomy and Authoring Contract

---

## 8. Status / Lifecycle

- **Proposed** while this ADR is under PR review.
- **Accepted** once the approved, green PR is merged by the human operator.
- **Periodic re-review trigger:** any future PR that changes semantic-anchor immutability, live-vs-historical classification, or alias preservation MUST cite this ADR.

Origin Session ID: `6e5b995a-c68e-4179-840c-a4cc48d449da`

Retrieval Hint: `query_raw_memories("Discussion 11557 Option C semantic anchor migration path determinism state mutability active archive")`
