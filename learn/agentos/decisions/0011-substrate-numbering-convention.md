# ADR 0011: Substrate Numbering Convention

> Architectural Decision Record defining compact `§<ref>` reference identity for live agent instruction substrate. Authority artifact for Epic #11558 / ticket #11559; corrected by Discussion #11577 and cleanup ticket #11584.

| Attribute | Value |
|---|---|
| **Status** | Proposed — 2026-05-18 (transitions to Accepted on approved, green PR merge by the human operator) |
| **Author** | @neo-gpt drafting; architecture authored by swarm via Discussion #11557 |
| **Graduated from** | Discussion #11557 — *"Substrate-numbering convention after byte-budget compaction (AGENTS.md + AGENTS_ATLAS.md)"* |
| **Implementation ticket** | #11559 — *"Author semantic-anchor policy ADR"* |
| **Parent epic** | #11558 — *"Substrate Numbering Semantic Anchor Migration"* |
| **Supersedes** | HTML anchor-tag scaffolding and markdown-link payloads as the default live-substrate reference form |
| **Informs** | #11560 lint guard; #11561 AGENTS / ATLAS migration; #11562 skill migration; #11564 ADR and documentation migration |
| **Anti-anchor for** | Contiguous renumbering, position-preservation as permanent policy, and rewriting ADR 0007's historical baseline as mutable policy clay |

---

## 1. Context

`AGENTS.md` and `AGENTS_ATLAS.md` originally used positional section numbers as compact references. Successive byte-budget compaction passes, especially the ADR 0007 compaction taxonomy work, intentionally moved or retired sections. The result is a fragmented "swiss-cheese" numbering pattern.

The positional convention became structurally load-bearing because live skill files, workflow references, ADRs, and agent handoffs cite `§N` targets. Once numbering is fragmented and mutable, a reference such as `AGENTS.md §21` no longer represents stable semantic identity. It represents a current file position that can drift during the next compaction.

Discussion #11557 selected **Option C globally**: live instruction substrate needs stable reference identity instead of fragile position-only section numbering. Gemini's canonical Step 2.5 sweep marked path determinism, state mutability, and active-vs-archive handling as real correctness dimensions, with migration blast radius handled by explicit child tickets under Epic #11558.

Discussion #11577 later corrected the reference-form substrate. The original worked example over-indexed on rendered Markdown clickability by using manual HTML anchor tags plus markdown-link payloads. That shape consumed Map-substrate headroom and violated ADR 0007's Map vs. World Atlas compaction discipline. The corrected form is a compact, source-visible `§<ref>` text token: semantic (`§mailbox_check_protocol`) where meaning is stable, positional (`§21`) where preserving the current map reference is cheaper and sufficiently clear.

ADR 0007 remains the historical authority for the compaction taxonomy. This ADR does not rewrite ADR 0007. It defines the successor reference-identity convention for live substrate after the taxonomy has made positional numbering too fragile.

---

## 2. Decision

Live instruction substrate MUST prefer compact `§<ref>` text tokens when a reference target needs to be source-visible and durable. Plain prose still wins when no stable reference token is needed. Markdown links and manual HTML anchor tags are not the default reference form; use them only for narrow rendered-consumer needs with explicit justification.

### 2.1 Compact text-token identity

A live substrate reference is a compact `§<ref>` token that names the target with minimal loaded-byte cost.

Recommended shape (underscore-separated semantic identifier):

```md
AGENTS.md §mailbox_check_protocol
```

Acceptable variants:

```md
AGENTS.md §21
AGENTS.md §mailbox_check_protocol
```

Use the semantic underscore-separated form when it reduces drift across heading movement or compaction. Preserve positional `§N` where it is historical, already source-readable, or cheaper than introducing a new semantic token. Do not add manual HTML anchor tags or markdown links merely to make the reference clickable in rendered Markdown.

In this substrate we call the semantic underscore-separated form a **semantic anchor** (the phrase has other meanings elsewhere; this records ours): its reference identity is the named *concept*, not the source position, so it survives heading movement and compaction where a positional `§N` (anchored to position) drifts. The term names the concept, never the rejected `<a id>` markup — it is load-bearing across the substrate (e.g. `AGENTS.md`'s *"semantic anchor per … core value"*) and was inadvertently dropped by PR #11589 when it correctly removed the manual-HTML-anchor implementation.

### 2.2 Reference stability and rendered aliases

Once a semantic `§<ref>` token is introduced, the token is treated as the live reference identity until explicitly retired or updated in the same PR as the referenced heading/content change.

Rendered clickability is secondary to loaded-byte budget. Prefer auto-generated heading IDs, source grep, and local textual context over manual alias scaffolding. A manual HTML anchor alias is only acceptable for a specific rendered-consumer requirement; it is not the default substrate pattern and requires explicit review justification.

### 2.3 Active vs. historical references

Active/live instruction references use `§<ref>` tokens when a compact stable reference is needed. This includes references whose consumer is a current agent, skill, workflow, CI guard, PR review, or ticket-intake path.

Historical/archaeology references MAY preserve original `§N` wording when the number is part of the historical record being described. Such references should be visibly classified as historical, archaeology, or errata when ambiguity is likely.

Examples:

- Live semantic: "Use `AGENTS.md §mailbox_check_protocol`."
- Live positional: "Apply `AGENTS.md §21` when that current map reference is cheaper and unambiguous."
- Historical: "ADR 0007 recorded the old `§21` disposition at the time of compaction."

### 2.4 Lint and migration partitioning

This ADR defines policy only. Discussion #11577 superseded the original migration fanout: do not launch a mass conversion merely to rewrite existing references. Future substrate work obeys the corrected form, and per-artifact cleanup is handled by narrow tickets such as #11584.

Enforcement aligns to the corrected failure mode:

- Block new manual HTML anchor-tag insertions in Map / skill / Agent OS substrate unless a rendered-consumer exception is justified.
- Preserve both positional `§N` and semantic `§underscore_separated` text tokens where they are source-visible and compact.
- Treat markdown-link references as an exception for rendered-consumer needs, not the live-substrate default.

### 2.5 Substrate-wide heading-form convention

Beyond reference tokens, the SAME `§semantic_concept_name` identifier is also the canonical HEADING form across all agent content. The heading IS the anchor; descriptive prose lives in the section body, not in the heading itself.

Recommended heading shape:

```md
## §mailbox_check_protocol

At turn start, you MUST check your A2A mailbox for unread messages.
...
```

Replaces positional heading forms like `## 21. The Mailbox Check Protocol (Pre-Flight at Turn Start)`.

Properties:

- **Self-documenting**: the heading IS the stable identifier; cross-substrate refs (`AGENTS.md §mailbox_check_protocol`) resolve to the heading directly
- **Byte-cheapest**: ~25 chars per heading vs ~60+ chars for prose-form headings
- **Compaction-immune**: section reordering / inserts / deletes don't invalidate references (no positional drift)
- **KB ingestion friendly**: anchor names are concept-bearing tokens (LLM-extractable + graph-indexable)
- **Cross-document drop friendly**: tickets / PRs / discussions can drop `§mailbox_check_protocol` and it resolves consistently to the same concept across all agent-content files

Scope of "agent content" for this convention:

- `AGENTS.md`, `AGENTS_ATLAS.md`, `AGENTS_STARTUP.md` (turn-loaded Map substrate)
- `.agents/ANTIGRAVITY_RULES.md` (Antigravity-specific turn-loaded substrate)
- `.agents/skills/**/*.md` (skill routers + references payloads)
- `learn/agentos/**/*.md` (ADRs, guides, measurements — Agent OS substrate)

User-facing documentation (`learn/guides/**`, `learn/benefits/**`) and code surface markdown remain free to use prose-form headings; the convention is scoped to substrate consumed primarily by agents.

Migration sequencing is per-tier (operator-decision; tracked in successor ticket like #11599); the convention itself ships in this ADR amendment.

---

## 3. Rationale

### 3.1 Why not contiguous renumbering

Contiguous renumbering fixes the cosmetic symptom once and recreates the same decay class on the next compaction. It also generates churn in references that did not semantically change.

### 3.2 Why not position-preservation

Position-preservation codifies the fragmented numbering pattern as permanent substrate. That preserves LLM parsing cost across every turn and every future session, which is worse than paying the one-time migration cost.

### 3.3 Why not mutate ADR 0007

ADR 0007 is the historical authority for the compaction taxonomy. Rewriting its baseline table would damage archaeology and hide the actual decision sequence. This ADR layers a successor convention on top of ADR 0007 instead.

### 3.4 Why text tokens instead of markdown links

Markdown links optimize rendered clickability at a repeated loaded-byte cost. Live agent substrate is consumed primarily as source text by LLMs and maintainers. The `§<ref>` form keeps the stable-reference class visible, grep-friendly, and cheap; rendered clickability can be supplied by auto-generated heading IDs or narrow local tooling when it is actually needed.

---

## 4. Consequences

### Positive

- Live references remain source-visible and compact across section movement, heading edits, and compaction.
- Agents can V-B-A a reference target by semantic meaning instead of mutable position.
- Lint can mechanically prevent recurrence of manual HTML anchor-tag scaffolding.
- Historical references remain preservable without pretending they are active routing anchors.

### Negative

- Authors must decide when a semantic token is worth its bytes versus plain prose or an existing positional `§N`.
- Rendered Markdown links are not automatic for every live reference.
- If a heading changes, authors must update affected semantic `§<ref>` tokens or justify a narrow alias.

---

## 5. Anti-Patterns

### 5.1 Blind global search-and-replace

Replacing every `§N` occurrence mechanically is wrong. Active references and historical references have different semantics. Run the active-vs-archive classification first.

### 5.2 Semantic tokens derived from volatile heading prose

Do not choose a semantic `§<ref>` token that merely mirrors volatile heading prose. Tokens should be short, explicit, and preserved or updated deliberately through heading rewrites. Under the §2.5 substrate-wide heading-form convention, this anti-pattern is mostly moot — the heading IS the anchor, so heading rewrites necessarily update the token deliberately.

### 5.3 Adding manual anchors during cleanup

Adding manual HTML aliases because they look like "semantic anchors" repeats the #11577 failure mode. Manual anchor tags require specific rendered-consumer justification.

### 5.4 Bundling policy, lint, and migration in one PR

This ADR is the policy authority. Lint and migration are downstream children. Bundling them would make review noisy and obscure whether the policy itself is accepted.

---

## 6. V-B-A Pre-Flight for Future Authors

Before modifying live substrate references under Epic #11558 or successors:

1. Read this ADR, ADR 0007, and Discussion #11577.
2. Classify each reference as active/live or historical/archaeology.
3. For active references, use compact `§<ref>` tokens only when plain prose is insufficient.
4. For historical references, preserve the historical wording or add an explicit errata/classification note.
5. Avoid manual HTML anchor tags unless a rendered-consumer exception is justified in the PR.
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
- Discussion #11577 — corrected `§<ref>` text-only reference form; no HTML anchor-tag default
- Ticket #11584 — ADR 0011 cleanup after #11577 graduation
- Ticket #11599 — Substrate-wide heading-form convention (§2.5 amendment + phased per-tier conversion)
- Discussion #11598 — MX loop spiral META framing (this amendment was operator-directed extraction of OQ2 from this Discussion)
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
