---
id: 6978
title: Update the `isUsingStateProviders` check to honor `Neo.config.unitTestMode`
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-07T17:59:00Z'
updatedAt: '2025-07-07T18:00:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6978'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-07T18:00:18Z'
---
# Update the `isUsingStateProviders` check to honor `Neo.config.unitTestMode`

* Inside the unit test mode, we run neo purely inside the main thread.
* As a result, `Neo.currentWorker` does not exist.
* To better support testing components, we need to add the flag directly to the `Neo` namespace.
* Additionally, prevent component#render() and `update()` attempts.

## Timeline

- 2025-07-07T17:59:00Z @tobiu assigned to @tobiu
- 2025-07-07T17:59:01Z @tobiu added the `enhancement` label
- 2025-07-07T17:59:24Z @tobiu referenced in commit `f3886aa` - "Update the isUsingStateProviders check to honor Neo.config.unitTestMode #6978"
- 2025-07-07T18:00:18Z @tobiu closed this issue
- 2025-07-09T00:10:51Z @tobiu referenced in commit `c55967b` - "Update the isUsingStateProviders check to honor Neo.config.unitTestMode #6978"

