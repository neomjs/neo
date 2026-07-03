---
id: 9803
title: 'Hybrid GraphRAG Phase 2: Pipeline Tuning & Deterministic Topology'
state: CLOSED
labels:
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-09T08:11:45Z'
updatedAt: '2026-04-09T08:32:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9803'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 9804 Implement Deterministic Edge Mapping for Document Gaps'
  - '[x] 9805 Centralize sandman_handoff.md generation in DreamService'
  - '[x] 9806 Enforce TTL Pruning for Graph Topology Gap Tracking'
  - '[x] 9807 Enforce Type-Aware Gap Targeting Constraints'
  - '[x] 9809 Ensure GitHub Discussions Surface Natively in the Golden Path'
subIssuesCompleted: 5
subIssuesTotal: 5
blockedBy: []
blocking: []
closedAt: '2026-04-09T08:32:33Z'
---
# Hybrid GraphRAG Phase 2: Pipeline Tuning & Deterministic Topology

## Problem
The initial iteration of the Hybrid GraphRAG pipeline successfully stood up the Native Edge Graph (SQLite) and basic Tri-Vector synthesis (Issue #9673). However, the `sandman_handoff.md` file suffers from infinite bloat due to unpruned appending, and the Capability Gap Inference generates false positives (Docs/Test gaps) by relying heuristically on LLM text output rather than deterministic codebase artifacts (e.g., `jsdocx.mjs`). By shifting to deterministic graph edges (e.g., mapping `MISSING_DOCS` directly from valid structural paths), we bypass hallucinated gaps and secure strategic mapping.

## Sub-Tasks
- [ ] Implement Deterministic Edge Mapping for Document Gaps (`docs/output/structure.json`)
- [ ] Implement Deterministic Edge Mapping for Playwright Test Gaps
- [ ] Centralize `sandman_handoff.md` regeneration in `DreamService.synthesizeGoldenPath`
- [ ] Enforce TTL (Time-to-Live) Pruning for historical Topological Conflicts
- [ ] Refactor LLM ReAct Gap pass to strictly evaluate "Strategic Drift"

## Definition of Done
- `sandman_handoff.md` correctly scales, is overwritten idempotently, and cleanly organizes the Golden Path and Structural gaps.
- `executeCapabilityGapInference` no longer flags adequately documented classes (e.g. `MainContainer`) as missing documentation.
- All gaps are tracked natively as formal SQLite Edge relationships (`MISSING_DOCS`, `MISSING_TESTS`, `CAUSES_CONFLICT`).

## Timeline

- 2026-04-09T08:11:47Z @tobiu added the `epic` label
- 2026-04-09T08:11:47Z @tobiu added the `ai` label
- 2026-04-09T08:11:47Z @tobiu added the `architecture` label
- 2026-04-09T08:12:04Z @tobiu cross-referenced by #9804
- 2026-04-09T08:12:05Z @tobiu cross-referenced by #9805
- 2026-04-09T08:12:06Z @tobiu cross-referenced by #9806
- 2026-04-09T08:12:14Z @tobiu added sub-issue #9804
- 2026-04-09T08:12:16Z @tobiu added sub-issue #9805
- 2026-04-09T08:12:17Z @tobiu added sub-issue #9806
- 2026-04-09T08:14:41Z @tobiu cross-referenced by #9807
- 2026-04-09T08:14:49Z @tobiu added sub-issue #9807
- 2026-04-09T08:22:42Z @tobiu cross-referenced by #9809
- 2026-04-09T08:22:48Z @tobiu added sub-issue #9809
- 2026-04-09T08:31:44Z @tobiu referenced in commit `192f892` - "fix(memory-core): Resolve SystemLifecycleService race condition during Discussion ingestion and finalize idempotent sandman handoff creation (#9803)"
- 2026-04-09T08:32:20Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-09T08:32:28Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ **Epic Completed: Hybrid GraphRAG Phase 2**
> 
> All objectives for transitioning the Neo.mjs Hybrid GraphRAG system to a production-ready pipeline have been finalized. The codebase was securely aligned with structural deterministic mapping:
> 1. Eliminated LLM hallucination in Gap inference by enforcing Type-Aware mapping with SQLite Native Edge structures (no more abstract false-positives).
> 2. Centralized and strictly bounded the `sandman_handoff.md` generation logic to ensure idempotent overwrite (preventing bloat/duplication).
> 3. Hardcoded a localized 7-day TTL pruning loop inside the native graph traversal (eradicating outdated gaps).
> 4. Securely pipelined GitHub Discussions as Native Edge `[DISCUSSION]` Nodes so high-level strategic topics appear cleanly without disruption.
> 
> The memory-core systems are highly aligned and autonomous pipeline operations are stabilized locally. Epic closed.

- 2026-04-09T08:32:34Z @tobiu closed this issue

