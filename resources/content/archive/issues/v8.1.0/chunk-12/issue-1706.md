---
id: 1706
title: 'model.Component: refactoring'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-01T14:52:58Z'
updatedAt: '2021-04-01T14:54:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1706'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-01T14:54:26Z'
---
# model.Component: refactoring

Thinking more about this topic, I no longer like the approach to parse `container.items`.

We need hooks inside `container.Base` to do this and the approach is not flexible for dynamically adding new components inside custom components which use child items, but are not related to containers.

Instead, we could just parse top level bindings and move the related logic into `component.Base`.

## Timeline

- 2021-04-01T14:52:58Z @tobiu added the `enhancement` label
- 2021-04-01T14:52:58Z @tobiu assigned to @tobiu
- 2021-04-01T14:54:19Z @tobiu referenced in commit `30ee11a` - "model.Component: refactoring #1706"
- 2021-04-01T14:54:26Z @tobiu closed this issue

