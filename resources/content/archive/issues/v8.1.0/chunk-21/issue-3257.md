---
id: 3257
title: buildScripts/addConfig
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2022-07-03T22:31:37Z'
updatedAt: '2024-09-13T02:30:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3257'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:30:12Z'
---
# buildScripts/addConfig

a new build program to automatically generate configs would be sweet.

after picking a config name, the program should ask (multi-select) to generate the
1. beforeGetConfig()
2. beforeSetConfig()
3. afterSetConfig()

methods boilerplate logic.

follow up ticket: the program should create a class instance (in nodejs) to figure out if this config was already set inside a base class. if so, remove the trailing config underscore and call the super class methods (in case they do exist).

## Timeline

- 2022-07-03T22:31:37Z @tobiu added the `enhancement` label
### @github-actions - 2024-08-30T02:28:01Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:28:02Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:30:11Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:30:12Z @github-actions closed this issue

