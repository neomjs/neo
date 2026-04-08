---
id: 9789
title: Add Playwright verification for Sandman Strategic Drift detection
state: CLOSED
labels:
  - enhancement
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-04-08T10:46:26Z'
updatedAt: '2026-04-08T10:47:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9789'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-08T10:47:06Z'
---
# Add Playwright verification for Sandman Strategic Drift detection

### Problem
Relying purely on Sandman statistical inferences or logs to confirm that Strategic Drift (`ALIGNMENT_DRIFT`) mapping "might be better now" following the Memory Core implementation is insufficient. We need to lock the behavior into the regression suite to prevent future pipeline breakages.

### Proposed Solution
Add dedicated Playwright unit tests within `test/playwright/unit/ai/mcp/server/memory-core/services/DreamService.spec.mjs` to specifically emulate an isolated topological node lacking strategic gravity and weighting, and explicitly assert that Sandman's integration proxies log an `[ALIGNMENT_DRIFT]` signal.

## Timeline

- 2026-04-08T10:46:27Z @tobiu added the `enhancement` label
- 2026-04-08T10:46:27Z @tobiu added the `ai` label
- 2026-04-08T10:46:27Z @tobiu added the `testing` label
- 2026-04-08T10:46:49Z @tobiu referenced in commit `a0399de` - "test: Add verification test for Sandman ALIGNMENT_DRIFT logic (#9789)"
### @tobiu - 2026-04-08T10:47:05Z

Added unit test specifically verifying that ALIGNMENT_DRIFT alerts are triggered in capability gap inference for nodes with low strategic weight and zero topological gravity.

- 2026-04-08T10:47:06Z @tobiu closed this issue
- 2026-04-08T10:47:08Z @tobiu assigned to @tobiu

