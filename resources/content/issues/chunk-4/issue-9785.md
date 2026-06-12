---
id: 9785
title: Implement Topological Gravity Detection in GraphService
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-08T10:01:16Z'
updatedAt: '2026-04-08T10:07:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9785'
author: tobiu
commentsCount: 1
parentIssue: 9784
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-08T10:07:56Z'
---
# Implement Topological Gravity Detection in GraphService

> Modify `GraphService.mjs` native SQLite queries to dynamically compute `in_degree` and `out_degree` metrics for nodes when querying their vicinity. This provides downstream LLMs with a hard mathematical proxy for a node's structural importance or "Gravity."

## Timeline

- 2026-04-08T10:01:18Z @tobiu added the `enhancement` label
- 2026-04-08T10:01:18Z @tobiu added the `ai` label
- 2026-04-08T10:01:27Z @tobiu added parent issue #9784
- 2026-04-08T10:01:43Z @tobiu assigned to @tobiu
- 2026-04-08T10:07:29Z @tobiu referenced in commit `bac6c4e` - "feat: Implement Strategic Intelligence Engine (gravity and drift) (#9785) (#9786) (#9787)
- Added getNodeGravity natively to GraphService.mjs (#9785)
- Enriched Node schema to persist strategic_weight and gravity_well (#9786)
- Implemented Strategic Gap/Drift detection in Sandman to alert [ALIGNMENT_DRIFT] (#9787)"
### @tobiu - 2026-04-08T10:07:54Z

Task completed. Added native topological gravity calculations (in_degree, out_degree) to GraphService.mjs, and verified via Playwright integration.

- 2026-04-08T10:07:56Z @tobiu closed this issue
- 2026-04-08T10:08:09Z @tobiu cross-referenced by #9784

