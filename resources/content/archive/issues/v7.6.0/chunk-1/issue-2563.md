---
id: 2563
title: 'container.Panel: add the ability to dynamically add headers'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - stale
assignees: []
createdAt: '2021-07-06T11:26:09Z'
updatedAt: '2024-09-16T02:36:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2563'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-16T02:36:47Z'
---
# container.Panel: add the ability to dynamically add headers

With the latest changes, we can now use a panel as a container, in case no headers are defined initially.

In case someone would want to add headers into the instance at a later point, we need to enhance the logic.

Please add a comment, in case you need this!

At first, we should move the headers creation logic out of `createItems()` into a new method.

`headers` => `headers_`

`afterSetHeaders()` => check for new entries (not contained inside `oldValue`) and add them.

Follow up ticket: `verticalHeadersFirst` => `verticalHeadersFirst_`. The afterSet method would need to adjust the inner containers as needed.

## Timeline

- 2021-07-06T11:26:09Z @tobiu added the `enhancement` label
- 2021-07-06T11:26:09Z @tobiu added the `help wanted` label
### @github-actions - 2024-09-01T02:38:28Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-01T02:38:29Z @github-actions added the `stale` label
### @github-actions - 2024-09-16T02:36:47Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-16T02:36:47Z @github-actions closed this issue

