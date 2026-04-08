---
id: 9787
title: Implement Strategic Drift Detection (Sandman)
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-08T10:01:19Z'
updatedAt: '2026-04-08T10:08:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9787'
author: tobiu
commentsCount: 1
parentIssue: 9784
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-08T10:08:07Z'
---
# Implement Strategic Drift Detection (Sandman)

> Refactor `executeCapabilityGapInference` to analyze graph connections for "Strategic Vacuums." If Sandman spots clusters of high-volume technical churn (high `in_degree` code nodes) that have zero topological pathway extending to a `gravity_well` node, it must formally alert an `[ALIGNMENT_DRIFT]` warning.

## Timeline

- 2026-04-08T10:01:23Z @tobiu added the `enhancement` label
- 2026-04-08T10:01:23Z @tobiu added the `ai` label
- 2026-04-08T10:01:30Z @tobiu added parent issue #9784
- 2026-04-08T10:01:46Z @tobiu assigned to @tobiu
- 2026-04-08T10:07:29Z @tobiu referenced in commit `bac6c4e` - "feat: Implement Strategic Intelligence Engine (gravity and drift) (#9785) (#9786) (#9787)
- Added getNodeGravity natively to GraphService.mjs (#9785)
- Enriched Node schema to persist strategic_weight and gravity_well (#9786)
- Implemented Strategic Gap/Drift detection in Sandman to alert [ALIGNMENT_DRIFT] (#9787)"
### @tobiu - 2026-04-08T10:08:05Z

Task completed. Refactored Sandman's Capability Gap detection inside DreamService to securely retrieve Topological Gravity via GraphService and detect [ALIGNMENT_DRIFT] strategic vacuums.

- 2026-04-08T10:08:07Z @tobiu closed this issue
- 2026-04-08T10:08:09Z @tobiu cross-referenced by #9784

