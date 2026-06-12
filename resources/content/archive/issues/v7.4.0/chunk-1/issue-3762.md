---
id: 3762
title: ComponentModel store entries should default to being typed as stores
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2023-01-04T01:51:00Z'
updatedAt: '2024-09-14T02:26:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3762'
author: maxrahder
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-14T02:26:24Z'
---
# ComponentModel store entries should default to being typed as stores

If you configure a component model stores entry, and forget to add `module` or `ntype:'store'` it doesn't create a store. (The entry ends up having the value null.) Is there a use case for any `stores` entry being anything other than a store config? If not, then it should have that default.
:-)

## Timeline

- 2023-01-04T01:51:00Z @maxrahder added the `enhancement` label
### @github-actions - 2024-08-30T02:27:23Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:27:23Z @github-actions added the `stale` label
### @github-actions - 2024-09-14T02:26:23Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-14T02:26:24Z @github-actions closed this issue

