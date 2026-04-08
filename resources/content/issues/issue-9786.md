---
id: 9786
title: 'Graph Schema: Gravity Wells & Strategic Weights'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-08T10:01:18Z'
updatedAt: '2026-04-08T10:08:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9786'
author: tobiu
commentsCount: 1
parentIssue: 9784
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-08T10:08:05Z'
---
# Graph Schema: Gravity Wells & Strategic Weights

> Update validation logic and Data Extraction prompts in `DreamService` to accept and persist programmatic boardroom metrics, including `strategic_weight` (1-10) and `gravity_well` (boolean) to explicitly anchor long-term vision nodes in the RAG map.

## Timeline

- 2026-04-08T10:01:21Z @tobiu added the `enhancement` label
- 2026-04-08T10:01:21Z @tobiu added the `ai` label
- 2026-04-08T10:01:29Z @tobiu added parent issue #9784
- 2026-04-08T10:01:45Z @tobiu assigned to @tobiu
- 2026-04-08T10:07:29Z @tobiu referenced in commit `bac6c4e` - "feat: Implement Strategic Intelligence Engine (gravity and drift) (#9785) (#9786) (#9787)
- Added getNodeGravity natively to GraphService.mjs (#9785)
- Enriched Node schema to persist strategic_weight and gravity_well (#9786)
- Implemented Strategic Gap/Drift detection in Sandman to alert [ALIGNMENT_DRIFT] (#9787)"
### @tobiu - 2026-04-08T10:08:04Z

Task completed. Augmented Node schema with gravity_well and strategic_weight attributes, and mapped them in DreamService for both JSON schema extraction and SQLite persistence.

- 2026-04-08T10:08:06Z @tobiu closed this issue
- 2026-04-08T10:08:09Z @tobiu cross-referenced by #9784

