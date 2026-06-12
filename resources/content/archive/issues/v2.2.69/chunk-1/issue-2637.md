---
id: 2637
title: 'core.Base: move the id_ config from component.Base into the core'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-07-21T11:53:25Z'
updatedAt: '2021-07-21T12:05:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2637'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-07-21T12:05:05Z'
---
# core.Base: move the id_ config from component.Base into the core

this includes a new `afterSetId()` method inside `core.Base`, which can react to id changes => removing the oldValue from the instance manager before adding the new entry.

## Timeline

- 2021-07-21T11:53:25Z @tobiu added the `enhancement` label
- 2021-07-21T11:53:26Z @tobiu assigned to @tobiu
- 2021-07-21T11:58:02Z @tobiu referenced in commit `266738b` - "core.Base: move the id_ config from component.Base into the core #2637"
- 2021-07-21T12:03:19Z @tobiu referenced in commit `63d3f09` - "#2637 component.Base: support for id changes => adjusting the manager.Component entries"
- 2021-07-21T12:05:05Z @tobiu closed this issue

