---
id: 5461
title: 'plugin.Responsive: remove Neo.Responsive'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - Dinkh
createdAt: '2024-06-23T08:36:35Z'
updatedAt: '2024-10-06T02:38:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5461'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-10-06T02:38:05Z'
---
# plugin.Responsive: remove Neo.Responsive

without doing a deep dive, using `Neo.Responsive` feels like a namespace pollution.

in case we want to share data across all instances of the plugin, we can either use a static class field or define a variable inside the module (e.g. on top of the class definition).

it kind of depends if we want to provide access to the data outside of the plugin. but even if so, we should expose a getter method inside the plugin to do this.

## Timeline

- 2024-06-23T08:36:35Z @tobiu added the `enhancement` label
- 2024-06-23T08:36:35Z @tobiu assigned to @Dinkh
### @github-actions - 2024-09-22T02:36:39Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-22T02:36:39Z @github-actions added the `stale` label
### @github-actions - 2024-10-06T02:38:05Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-10-06T02:38:06Z @github-actions closed this issue

