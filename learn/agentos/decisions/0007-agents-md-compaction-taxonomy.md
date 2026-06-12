# ADR 0007: Compaction Taxonomy (3-Axis Slot Rule)

> Architectural Decision Record establishing the Compaction Taxonomy—a 3-Axis Slot Rule framework governing how agent memory substrate instructions are classified and managed under the Progressive Disclosure strategy. Extracted from the L1 anchor to a standalone architectural primitive per Discussion #11419.

| Attribute | Value |
|---|---|
| **Status** | Accepted — 2026-05-15 (Operator content-accuracy approval achieved, Phase A implementation merged) |
| **Author** | @neo-gemini-3-1-pro drafting; architecture proposed by @neo-opus-4-7; challenged to ADR format by operator @tobiu |
| **Graduated from** | Discussion #11419 — *"AGENTS.md Progressive Disclosure (Phase A)"* |
| **Implementation ticket** | #11420 — *"Phase A: Extract Compaction Taxonomy to ADR 0007"* |
| **Supersedes** | (a) In-line taxonomy table inside `AGENTS.md` that consumed critical byte-budget; (b) Implicit rule classification. |
| **Informs** | All future modifications, compactions, and additions to `AGENTS.md` and the broader memory substrate. |
| **Anti-anchor for** | Substrate growth without rigor; adding rules to the L1 anchor without evaluating their trigger-frequency, failure-severity, and enforceability. |

---

## 1. Context

The AI Agent Memory Substrate (specifically `AGENTS.md`) is subject to strict context-window per-file limits imposed by various MCP harnesses (Antigravity enforces a hard 24KB cap). Unchecked growth of instructions in `AGENTS.md` leads to silent truncation, blinding the agents to critical rules.

To combat this, the swarm developed a "Compaction Taxonomy"—a framework to evaluate and offload rules from the L1 anchor file to secondary Atlas files or skill payloads (Progressive Disclosure). However, keeping the taxonomy framework itself inside `AGENTS.md` occupied ~3.1KB of the highly contested byte budget.

Per Discussion #11419 (Phase A) and a direct operator challenge to formally encode this framework as an Architectural Decision Record, the Compaction Taxonomy is hereby extracted to this standalone ADR primitive.

---

## 2. Decision: The 3-Axis Slot Rule

The memory substrate is compacted per the **3-Axis Slot Rule**:

1. **Trigger-Frequency**: How often does the agent need to check this rule? (Every turn vs. specific tasks).
2. **Failure-Severity**: What is the cost of missing this rule? (Permanent data loss vs. stylistic drift).
3. **Enforceability**: Is this rule mechanically enforceable or discipline-only?

Based on these axes, every section in the instruction substrate receives a **Disposition**:

- **`keep`**: Rule stays in the L1 anchor (`AGENTS.md`). Reserved for invariants, critical gates, and frequent routing tables.
- **`move`**: Rule is completely relocated to an Atlas (`AGENTS_ATLAS.md` or a skill `.md` payload).
- **`compress-to-trigger`**: Rule details are moved to an Atlas, but a high-density trigger/pointer is kept in the L1 anchor.
- **`rewrite`**: Rule is refactored to increase density.
- **`retire`**: Rule is obsolete or subsumed and removed entirely.

### 2.0.1 Post-Pruning-Recurrence-Rate Sub-Axis

Trigger-frequency decomposes into (a) per-turn-load-frequency and (b) post-pruning-discipline-recall-recurrence. Skills that shape ongoing session behavior (`lead-role`, `peer-role`, `pull-request`, `pr-review`, `post-review-pickup`) require their native skill-loading as a recursive-reload anchor to persist across context-window pruning cycles. One-shot lifecycle skills (`ticket-create`, `ticket-triage`, `ticket-intake`, `epic-review`, `epic-resolution`, `ideation-sandbox`, `memory-mining`, `turn-memory-pre-flight`, `create-skill`, `architecture-pre-flight`, `tech-debt-radar`, `structural-pre-flight`, `session-sunset`, `unit-test`, `whitebox-e2e`) do not require this anchor.

### 2.0.2 Friction Classification Vocabulary

The `friction -> gold` core value needs retrieval-safe vocabulary so agents do not re-derive the same distinction from closed Discussion comments. These terms classify substrate-evolution proposals; they are review heuristics, not a mandatory gate:

- **Gold**: durable substrate value that reduces future coordination cost more than it adds maintenance cost.
- **Blocker**: friction that prevents v13 / active task completion, or breaks a required substrate pathway.
- **Minor friction**: real cost or annoyance, but not currently blocking and not enough to justify substrate mutation before higher-priority lanes.

This vocabulary preserves the substrate-truth from Discussion #11452 without adopting its rejected mandatory 4-test filter.

### 2.1 The Baseline Taxonomy Classifications

*Note: This reflects the baseline dispositions applied during the progressive disclosure migration. Future rules must be evaluated against the 3-axis rule.*

| Section | Disposition | Tag (AC7) | Rationale / Friction Capture | Recursive-Reload Anchor |
|---|---|---|---|---|
| §0 Critical Gates | `keep` | MACHINE-ENFORCEABLE-CANDIDATE | Irreversible failure modes. | - |
| §0 Invariant 7 | `keep` | MACHINE-ENFORCEABLE-CANDIDATE | No tracked file edits without a self-assigned ticket. | - |
| §0 Invariant 8 | `keep` | MACHINE-ENFORCEABLE-CANDIDATE | Agent-authored PRs target `dev`; `main` is release-only. | - |
| §1 Communication Style | `move` | DISCIPLINE-ONLY | Low frequency gate, high depth. | - |
| §2 Anti-Hallucination | `move` | DISCIPLINE-ONLY | High depth protocol, moved to Atlas. | - |
| §3 Pre-Commit Hard Gates | `keep` | MACHINE-ENFORCEABLE-CANDIDATE | Severe failure mode (ticket-ID/context). | - |
| §4 Memory Core Protocol | `keep` | MACHINE-ENFORCEABLE-CANDIDATE | Permanent data loss if missed. | - |
| §4.3 Un-savable Turns | `move` | DISCIPLINE-ONLY | Edge case recovery protocol. | - |
| §5 Strategic Co-Founder | `move` | DISCIPLINE-ONLY | Low frequency pivot logic. | - |
| §6 Request Triage | `move` | DISCIPLINE-ONLY | High depth intake logic. | - |
| §7 PR Mandate | `move` | MACHINE-ENFORCEABLE-CANDIDATE | Execution moved to skill payload. | - |
| §8 Resumption Protocol | `move` | DISCIPLINE-ONLY | Interruption recovery. | - |
| §9 Reading Files | `move` | DISCIPLINE-ONLY | Efficiency guideline. | - |
| §10 Testing Protocol | `compress-to-trigger` | DISCIPLINE-ONLY | High depth, tripwire needs pointer. | - |
| §11 File Editing | `keep` | MACHINE-ENFORCEABLE-CANDIDATE | Frequent operation with strict tool limits. | - |
| §12 Coding Syntax | `move` | MACHINE-ENFORCEABLE-CANDIDATE | Relocated entirely. | - |
| §13 Self-Evolving Systems | `keep` | DISCIPLINE-ONLY | MX rule-refinement loop is per-turn reflex. | - |
| §13.1 Contributions Over Commits | `keep` | DISCIPLINE-ONLY | MX productivity primitive supersedes velocity-bias; per-turn reward-signal anchor. | - |
| §14 Sunset Protocol | `compress-to-trigger`| MACHINE-ENFORCEABLE-CANDIDATE | Session termination gate. | - |
| §15 Knowledge Base | `compress-to-trigger`| DISCIPLINE-ONLY | §15.5 Neo Identity Anchor in main as anti-drift; §15.1-15.4 in Atlas. | - |
| §15.6 Swarm Topology Anchor | `keep` | DISCIPLINE-ONLY | Defends Flat Peer-Team against orchestrator-worker training-data drift; cross-peer coordination trigger. | - |
| §16 Implementation Loop | `move` | DISCIPLINE-ONLY | High depth workflow. | - |
| §17 Virtuous Cycle | `move` | DISCIPLINE-ONLY | High depth workflow. | - |
| §18 Session Maintenance | `move` | DISCIPLINE-ONLY | High depth workflow. | - |
| §19 Sub-Agents | `move` | DISCIPLINE-ONLY | High depth workflow. | - |
| §20 Visual Verification | `compress-to-trigger`| DISCIPLINE-ONLY | Frontend tasks only. | - |
| (Retired) Workflow Skills | `retire` | MACHINE-ENFORCEABLE-CANDIDATE | Routing table removed; relies on native skill-loading via frontmatter parity. | N/A |
| §21 Mailbox Check | `keep` | MACHINE-ENFORCEABLE-CANDIDATE | Turn-start invariant. | - |
| §22 Edge-Case Triggers | `keep` | DISCIPLINE-ONLY | The actual Atlas pointer section. | - |

---

## 3. Implementation Details

- **Standalone Extraction:** The taxonomy table is removed from `AGENTS.md`.
- **Top-of-File Pointer:** The file receives the following exact 1-line pointer in place of the table:
  > *"Compaction taxonomy is substrate-authoring guidance; before modifying turn-loaded or skill-loaded instruction substrate, load `learn/agentos/decisions/0007-agents-md-compaction-taxonomy.md`."*
- **ADR-at-Graduation:** This file formally fulfills the `ADR_REQUIRED` criteria for Discussion #11419 per ADR 0005, providing a durable, graph-queryable authority for the progressive disclosure architecture.

---

## 4. Consequences

### Positive
- `AGENTS.md` sheds ~3153 bytes immediately (from 27659 to 24506 bytes), granting ~70 bytes of headroom under the hard 24KB limit.
- Establishes a permanent, immutable framework for managing future substrate additions (Substrate Accretion Defense).
- Eliminates multi-source authority drift regarding why rules were moved or kept.

### Negative
- Agents authoring new rules must follow an additional pointer to read the taxonomy instead of having it directly in their immediate context.

---

## 5. Anti-Patterns (Substrate-Bypass Prevention)

### 5.1 Substrate Accretion Without Taxonomy
Adding new, lengthy rules to `AGENTS.md` without evaluating them against the 3-Axis Slot Rule. New rules must be classified and assigned a disposition before insertion. If the disposition is `move` or `compress-to-trigger`, the rule text belongs in the Atlas.

### 5.2 Compaction Taxonomy Mutation
Modifying the baseline taxonomy dispositions directly in this ADR. This ADR is the immutable authority anchor. Future shifts in disposition (e.g., if a `keep` becomes a `move`) should be recorded via a new ADR or as documented changes in the target Atlas files, not by rewriting this historical baseline.

### 5.3 Recursive-Reload Anchor Retirement
Retiring `AGENTS.md` §21 trigger entries that are marked as `recursive-reload-required` (YES) during Phase C compression cycles *without replacing them via native skill-loading injection*. These entries are empirically load-bearing for post-pruning-discipline-recall in long sessions; compressing them breaks behavioral disciplines (e.g., `lead-role`, `peer-role`, `post-review-pickup`). (Note: The final compaction safely retired the §21 table because the `description` frontmatter of all progressive disclosure skills is now natively injected into the turn-based memory environment on every turn).

### 5.4 Additive-Drift Reflex on Substrate-Correction Tickets
When a substrate-correction ticket exists to reduce friction, adding another audit, checklist, or template is the wrong default if direct deletion or compression of the existing substrate solves the same failure mode. Classify the friction first as cause, symptom, or direct-delete candidate, then prefer `retire` / `rewrite` / `compress-to-trigger` over new surface area when behavior can remain protected. Provenance: Discussion #11891 / PR #11892.

---

## 6. Related

- **Discussion #11419** — The origination point for this Phase A progressive disclosure extraction.
- **Discussion #11452** — STEP_BACK / no-graduation closeout that preserved the `gold` / `blocker` / `minor friction` vocabulary while rejecting a mandatory 4-test gate.
- **Ticket #11420** — The implementation ticket for this ADR.
- **ADR 0005** — ADR-at-Graduation workflow, which mandated this taxonomy be formally shaped as an ADR.

---

## 7. Status / Lifecycle

- **Proposed** (Cycle 2.5 consensus achieved; awaiting operator content-accuracy approval)
- Origin Session ID: `188acb85-b41e-435c-94ee-0cc9944d4c97`
