---
id: 7720
title: 'Refactor: Inline `healthHelpers.mjs` into `HealthService.mjs`'
state: CLOSED
labels:
  - ai
  - refactoring
assignees: []
createdAt: '2025-11-08T09:50:28Z'
updatedAt: '2025-11-11T08:35:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7720'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-11T08:35:17Z'
---
# Refactor: Inline `healthHelpers.mjs` into `HealthService.mjs`

The `healthHelpers.mjs` file was introduced in PR #7717 to separate parsing logic from `HealthService.mjs`. However, this logic is not shared with any other module, and the file itself is quite short. To simplify the architecture, the helper functions (`combineOutput`, `parseAuthOutput`, `parseVersionOutput`, `interpretExecError`) should be moved back into `HealthService.mjs` as private methods, and the `healthHelpers.mjs` file should be deleted. The associated test file `healthHelpers.test.mjs` should also be either removed or its tests integrated into a test for `HealthService.mjs`.

## Timeline

- 2025-11-08T09:50:30Z @tobiu added the `ai` label
- 2025-11-08T09:50:30Z @tobiu added the `refactoring` label
- 2025-11-08T10:03:47Z @tobiu cross-referenced by PR #7717
- 2025-11-11T08:01:31Z @MannXo cross-referenced by PR #7738
- 2025-11-11T08:35:17Z @tobiu closed this issue

