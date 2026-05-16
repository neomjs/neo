---
id: 5265
title: 'component.wrapper.MonacoEditor: using the ResizeObserver'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-02-23T17:38:10Z'
updatedAt: '2024-03-04T17:08:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5265'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-03-04T17:08:52Z'
---
# component.wrapper.MonacoEditor: using the ResizeObserver

while we already call `editor.layout()` when changing the height or width configs, this does not feel sufficient.

imagine flexbox layouts or browser resizing. so we should honor all size changes and re-layout the editor div in a buffered way.

## Timeline

- 2024-02-23T17:38:10Z @tobiu added the `enhancement` label
- 2024-02-23T17:38:11Z @tobiu assigned to @tobiu
- 2024-03-04T17:07:37Z @tobiu referenced in commit `3941b44` - "component.wrapper.MonacoEditor: using the ResizeObserver #5265"
- 2024-03-04T17:08:52Z @tobiu closed this issue
- 2024-03-26T16:29:39Z @tobiu referenced in commit `5fd809d` - "component.wrapper.MonacoEditor: using the ResizeObserver #5265"

