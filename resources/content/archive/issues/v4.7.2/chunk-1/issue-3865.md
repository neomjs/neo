---
id: 3865
title: 'component.Gallery: initial selections can break'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-01-15T15:12:23Z'
updatedAt: '2023-01-15T18:21:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3865'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-15T18:21:12Z'
---
# component.Gallery: initial selections can break

<img width="549" alt="Screenshot 2023-01-15 at 16 09 06" src="https://user-images.githubusercontent.com/1177434/212549336-82fdab1e-540c-4f12-b9fb-4f30d3557457.png">

this happens frequently when navigating between the gallery & helix views within the covid app.

i am pretty sure that the bug got introduced when fixing 2way bindings. my guess is that the selection model wants to access the real dom before the component got mounted.

## Timeline

- 2023-01-15T15:12:23Z @tobiu added the `bug` label
- 2023-01-15T15:12:24Z @tobiu assigned to @tobiu
- 2023-01-15T18:20:53Z @tobiu referenced in commit `dbbe0fb` - "component.Gallery: initial selections can break #3865"
- 2023-01-15T18:21:12Z @tobiu closed this issue

