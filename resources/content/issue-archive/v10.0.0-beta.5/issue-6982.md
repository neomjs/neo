---
id: 6982
title: v10 state.Provider enhancements
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-07T22:19:05Z'
updatedAt: '2025-07-07T22:19:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6982'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-07T22:19:43Z'
---
# v10 state.Provider enhancements

The rewrite to fully embrace the new reactivity model in neo needs some adjustments:

* Restore the lost `onDataPropertyChange()` logic.
* Restore the ability to store `data.Records` inside state provider data.
* Polish edge-cases, where data access bypassed the proxy

## Timeline

- 2025-07-07T22:19:05Z @tobiu assigned to @tobiu
- 2025-07-07T22:19:06Z @tobiu added the `enhancement` label
- 2025-07-07T22:19:33Z @tobiu referenced in commit `57e6da2` - "v10 state.Provider enhancements #6982"
- 2025-07-07T22:19:43Z @tobiu closed this issue
- 2025-07-09T00:10:51Z @tobiu referenced in commit `6b3010e` - "v10 state.Provider enhancements #6982"

