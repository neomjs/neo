---
id: 5406
title: 'manager.DomEvent: fire() => prevent delegation for resize custom dom events'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-05-25T21:54:25Z'
updatedAt: '2024-05-25T21:56:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5406'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-05-25T21:56:09Z'
---
# manager.DomEvent: fire() => prevent delegation for resize custom dom events

`main.addon.ResizeObserver` creates custom dom events for resizing.

these events should only trigger listener fns in case it is a direct match.

example: a monaco editor has a resize event. in case we add a resize listener to a parent (e.g. the viewport), we do not want editor size changes to get into the viewport handler.

## Timeline

- 2024-05-25T21:54:25Z @tobiu added the `enhancement` label
- 2024-05-25T21:54:26Z @tobiu assigned to @tobiu
- 2024-05-25T21:56:04Z @tobiu referenced in commit `1c7375f` - "manager.DomEvent: fire() => prevent delegation for resize custom dom events #5406"
- 2024-05-25T21:56:09Z @tobiu closed this issue

