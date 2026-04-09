---
id: 9803
title: 'Hybrid GraphRAG Phase 2: Pipeline Tuning & Deterministic Topology'
state: OPEN
labels:
  - epic
  - ai
  - architecture
assignees: []
createdAt: '2026-04-09T08:11:45Z'
updatedAt: '2026-04-09T08:11:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9803'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[ ] 9804 Implement Deterministic Edge Mapping for Document Gaps'
  - '[ ] 9805 Centralize sandman_handoff.md generation in DreamService'
  - '[ ] 9806 Enforce TTL Pruning for Graph Topology Gap Tracking'
  - '[ ] 9807 Enforce Type-Aware Gap Targeting Constraints'
subIssuesCompleted: 0
subIssuesTotal: 4
blockedBy: []
blocking: []
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

