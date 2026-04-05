---
id: 9714
title: '[Sandman] Hybrid GraphRAG Scoring Algorithm'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2026-04-05T00:44:17Z'
updatedAt: '2026-04-05T00:44:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9714'
author: tobiu
commentsCount: 0
parentIssue: 9673
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

