# Loading-Runtime-Effect Substitution Audit

Reactive-side audit fired during `/pr-review`. The **proactive** counterpart `/turn-memory-pre-flight` skill (Epic #11256 substrate) owns the canonical substrate-effect framing, IN-SCOPE file list, mechanical pre-flight protocol, and decision tree. This audit defines the **reviewer-side discipline only** — what to recognize at PR-review time + the Required-Action shape when the pattern fires.

## Authoritative substrate (do NOT duplicate here)

See [`.agents/skills/turn-memory-pre-flight/references/turn-memory-pre-flight-workflow.md`](../../turn-memory-pre-flight/references/turn-memory-pre-flight-workflow.md) for:

- IN-SCOPE / OUT-OF-SCOPE / CARVE-OUT file list (Substrate Boundary section)
- 5-step Placement Decision Tree
- 4-step Mechanical Pre-Flight Protocol (`cat .codex/hooks.json` etc.)
- PR #11244 empirical anchor + PR #11250 + Epic #11256 anchors

## When this audit fires (reviewer-side)

At `/pr-review` time, when a PR modifies any file listed in `/turn-memory-pre-flight` atlas Substrate Boundary IN-SCOPE list. The audit verifies the **author applied** `/turn-memory-pre-flight` discipline pre-substrate-mutation. If the audit detects unaudited substrate-effect dimension, flag as Required Action.

## The Failure Mode (reviewer recognition shape)

**Loading-runtime-effect substitution**: PR approves on FILE-COMPLETENESS dimension *("3 harness files have the block, cross-harness symmetry achieved")* without verifying RUNTIME-LOAD EFFECT *("does content load once or twice per turn?")*.

Distinct from rubber-stamping (§7.7 row 3): the failure is **DIMENSION** (effect-surface unaudited) not **ENGAGEMENT** (content-surface reviewed). Substantive feedback can be given across multiple cycles while the load-effect dimension stays invisible. Specific instance of **Flattening-Bias** from Discussion #11259's 4-sub-mode enumeration (Deference / Action / Approval / Flattening). PR #11244's 6-cycle arc (3 reviewers / 4 missed cycles / operator V-B-A) is the canonical empirical anchor — see `/turn-memory-pre-flight` atlas for full detail.

## Required Action template (reviewer-side)

> *"Substrate-touching files modified ({list IN-SCOPE files from PR diff}). PR body does not document `/turn-memory-pre-flight` decision-tree application. Required: invoke `/turn-memory-pre-flight` retrospectively + document the 5-step decision-tree application + mechanical pre-flight commands run + harness-load-duplication risk audit in PR body."*

## Cross-skill bridge

- **Proactive companion (substrate-creation time)**: `/turn-memory-pre-flight` (Epic #11256 substrate; AGENTS.md §21 trigger)
- **Architectural router (ambiguous cases)**: `/architecture-pre-flight` (Epic #11256 substrate)
- **Helpful-Assistant 4-sub-mode context**: Discussion #11259 (CLOSED RESOLVED) → ticket #11262 → PR #11263 (substrate-load-time XML salience metadata)
