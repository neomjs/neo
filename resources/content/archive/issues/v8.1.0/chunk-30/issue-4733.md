---
id: 4733
title: 'form.field.Switch: remove the position keyframes'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-08-16T07:12:34Z'
updatedAt: '2023-08-16T07:38:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4733'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-08-16T07:38:22Z'
---
# form.field.Switch: remove the position keyframes

@Dinkh: i am not sure what the intention was: there are transform & position based animations defined in selectors using the same name => overwriting each other.

at first i thought you wanted to use both of them (it is possible to add multiple items into `animation` separated by commas).

tried this and it looked completely broken.

so, i will remove the position based keyframes for now. please give me a heads up, i miss something here.

## Timeline

- 2023-08-16T07:12:34Z @tobiu added the `enhancement` label
- 2023-08-16T07:12:34Z @tobiu assigned to @tobiu
- 2023-08-16T07:14:54Z @tobiu referenced in commit `268d89a` - "form.field.Switch: remove the position keyframes #4733"
- 2023-08-16T07:38:22Z @tobiu closed this issue

