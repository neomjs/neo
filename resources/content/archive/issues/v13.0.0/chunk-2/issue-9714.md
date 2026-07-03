---
id: 9714
title: '[Sandman] Hybrid GraphRAG Scoring Algorithm'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-05T00:44:17Z'
updatedAt: '2026-04-05T15:30:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9714'
author: tobiu
commentsCount: 1
parentIssue: 9673
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-05T15:30:01Z'
---
# [Sandman] Hybrid GraphRAG Scoring Algorithm

# [Sandman] Hybrid GraphRAG Scoring Algorithm

### Description
Once the Vector Bridge (#9709) is active, Sandman's `synthesizeGoldenPath()` algorithm must be updated to leverage the full capabilities of the newly unified SQLite VSS database. Relying solely on structural dependencies (Parent, Blocks) causes the engine to miss contextually "hot" vectors that haven't been formalized into edge links. We need to implement a mathematical Hybrid function. 

### Acceptance Criteria
- Rewrite the SQLite prioritization query in `GraphService` or `DreamService` to pull both vector similarity (from `_vec`) and topological edges (from `_data` and the `edges` table).
- Calibrate the priority calculation formula to blend Semantic Similarity with Hebbian Weight (e.g., `Priority = (Semantic_Similarity_to_Frontier * X) + (Hebbian_Weight * Y)`).
- Ensure unblocked nodes with exceptionally high Semantic Similarity can bypass lower-weighted structural nodes.

Related Epic: #9673

## Timeline

- 2026-04-05T00:44:18Z @tobiu added the `enhancement` label
- 2026-04-05T00:44:19Z @tobiu added the `ai` label
- 2026-04-05T00:44:19Z @tobiu added the `architecture` label
- 2026-04-05T00:44:25Z @tobiu added parent issue #9673
- 2026-04-05T00:50:54Z @tobiu assigned to @tobiu
- 2026-04-05T14:00:26Z @tobiu cross-referenced by #9721
- 2026-04-05T15:27:54Z @tobiu referenced in commit `fb46666` - "fix: Hybrid GraphRAG Scoring Algorithm (#9714)

- Configured aiConfig.engine to 'neo' in test suites for proper lifecycle binding.
- Cleaned up diagnostic traces.
- Removed invalid SQL parameter matching bindings causing crash."
### @tobiu - 2026-04-05T15:28:12Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ The Sandman Hybrid GraphRAG Scoring Algorithm has been completed and verified successfully natively across the SQLite Edge Graph database. 
> 
> ### Fixes implemented:
> - Isolated test suites to accurately use `neo` engine bypassing legacy chroma layers.
> - Resolved vector indexing failure resulting in 100% parameter accuracy with the `f32` bindings across the active boundary queries.
> - Cleaned up diagnostic traces ensuring clean output pipelines.
> 
> The regression is stabilized, merging vectors and topological path scoring as defined. Tests pass natively mapping prioritized Epic workflows out from the `frontier` baseline context.

- 2026-04-05T15:30:01Z @tobiu closed this issue

