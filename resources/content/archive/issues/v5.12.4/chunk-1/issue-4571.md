---
id: 4571
title: 'button.Base: domListeners refactoring'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-07-25T21:02:35Z'
updatedAt: '2023-07-26T12:43:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4571'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-07-26T12:43:23Z'
---
# button.Base: domListeners refactoring

while the domListeners won't end up inside the DOM, at this point we have up to 4 add calls.

instead, we should just add one listener pointing to a new class method like `onClick()`, which can then execute the handler, route, rippleEffect and menu toggle as needed.

## Timeline

- 2023-07-25T21:02:35Z @tobiu added the `enhancement` label
- 2023-07-25T21:02:35Z @tobiu assigned to @tobiu
- 2023-07-26T11:01:29Z @tobiu referenced in commit `c14d638` - "button.Base: domListeners refactoring #4571"
- 2023-07-26T12:43:12Z @tobiu referenced in commit `d49944a` - "#4571 button.Base: domListeners refactoring"
- 2023-07-26T12:43:23Z @tobiu closed this issue

