---
id: 7731
title: 'Fix: incorrect length check for releases object in ReleaseSyncer'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-11-09T09:25:44Z'
updatedAt: '2025-11-09T09:28:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7731'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-09T09:28:37Z'
---
# Fix: incorrect length check for releases object in ReleaseSyncer

The `ReleaseSyncer` service incorrectly used the `.length` property on the `this.releases` object. Since this is an object and not an array, the check was not functioning as intended.

This has been corrected to use `Object.keys(this.releases).length` to accurately count the number of releases.

This fix ensures that:
1. The log message for cached releases displays the correct count.
2. The warning for finding zero releases since the sync start date now triggers correctly.

## Timeline

- 2025-11-09T09:25:45Z @tobiu added the `bug` label
- 2025-11-09T09:25:46Z @tobiu added the `ai` label
- 2025-11-09T09:28:30Z @tobiu referenced in commit `a60dc56` - "Fix: incorrect length check for releases object in ReleaseSyncer #7731"
- 2025-11-09T09:28:32Z @tobiu assigned to @tobiu
- 2025-11-09T09:28:37Z @tobiu closed this issue

