---
id: 5619
title: 'core.Base: setStaticConfig() => evaluate if we can remove the staticConfig part'
state: OPEN
labels:
  - enhancement
  - no auto close
assignees: []
createdAt: '2024-07-23T19:49:16Z'
updatedAt: '2026-05-16T20:50:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5619'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# core.Base: setStaticConfig() => evaluate if we can remove the staticConfig part

this logic feels outdated => before webpack was supporting static class fields.

we can now probably directly access the ctor instead.

## Timeline

- 2024-07-23T19:49:16Z @tobiu added the `enhancement` label
### @github-actions - 2024-10-22T02:34:26Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-10-22T02:34:26Z @github-actions added the `stale` label
- 2024-10-22T11:07:41Z @tobiu removed the `stale` label
- 2024-10-22T11:07:41Z @tobiu added the `no auto close` label

