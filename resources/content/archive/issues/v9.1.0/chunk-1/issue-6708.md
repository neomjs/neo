---
id: 6708
title: 'component.Helix: addResizeObserver()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-05-13T11:50:08Z'
updatedAt: '2025-05-13T11:50:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6708'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-05-13T11:50:37Z'
---
# component.Helix: addResizeObserver()

* Currently `offsetHeight` and `offsetWidth` only gets pulled from main once a mount operation happens.
* This is not sufficient for resizing the component, where we want to ensure that expanding an item always results in using the top-left corner.

## Timeline

- 2025-05-13T11:50:09Z @tobiu added the `enhancement` label
- 2025-05-13T11:50:11Z @tobiu assigned to @tobiu
- 2025-05-13T11:50:26Z @tobiu referenced in commit `3fcdfce` - "component.Helix: addResizeObserver() #6708"
- 2025-05-13T11:50:37Z @tobiu closed this issue

