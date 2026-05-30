---
id: 1586
title: 'core.Base: ctor => move controller.parseConfigs() into component.Base'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-03-25T23:44:02Z'
updatedAt: '2021-03-25T23:44:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1586'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-25T23:44:38Z'
---
# core.Base: ctor => move controller.parseConfigs() into component.Base

The call does not belong into core.Base, since VCs are component related.

we can override `initConfig()` instead and use it as a ctor hook to trigger the logic at the same spot.

## Timeline

- 2021-03-25T23:44:02Z @tobiu added the `enhancement` label
- 2021-03-25T23:44:02Z @tobiu assigned to @tobiu
- 2021-03-25T23:44:18Z @tobiu referenced in commit `ea8267c` - "core.Base: ctor => move controller.parseConfigs() into component.Base #1586"
- 2021-03-25T23:44:38Z @tobiu closed this issue

