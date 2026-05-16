---
id: 1087
title: Neo.dialog.Toast
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
assignees:
  - Dinkh
createdAt: '2020-08-17T08:39:12Z'
updatedAt: '2023-01-06T12:50:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1087'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-06T12:50:57Z'
---
# Neo.dialog.Toast

Could be a good first issue, since a lot of toast message implementations are already out there and creating the animations should be fun.

We could extend the Dialog Class.

We probably want to use a manager class as well.

Toast Messages need a timeout config, closable (timeout:0), position (tr, tc, br,...), a slide in direction (e.g. in case they appear at the top right edge of the screen, it should be possible to slide them in from the top or right side).

Once the timeout ends => fadeOut.

As the name suggests, toast messages can stack.

## Timeline

- 2020-08-17T08:39:12Z @tobiu added the `enhancement` label
- 2020-08-17T08:39:12Z @tobiu added the `help wanted` label
- 2020-08-17T08:39:12Z @tobiu added the `good first issue` label
### @tobiu - 2020-08-18T21:33:55Z

another option to keep it more lightweight is extending component.Base.

- 2023-01-03T12:33:39Z @tobiu assigned to @Dinkh
- 2023-01-03T12:36:29Z @tobiu referenced in commit `facbb8d` - "Neo.dialog.Toast #1087"
- 2023-01-06T02:55:00Z @Dinkh referenced in commit `5a1c0c4` - "feature: solving #1087
- Updated the toasts to run without the overhead from dialog
- stacks multiple toasts now
- updated example"
### @Dinkh - 2023-01-06T02:58:04Z

Solved in #3800 

- 2023-01-06T08:11:10Z @tobiu referenced in commit `768c07b` - "Merge pull request #3800 from neomjs/@feature/Dinkh/toast-multipleToasts

feature: Stacking toasts solving #1087"
- 2023-01-06T12:50:57Z @Dinkh closed this issue
- 2023-01-30T09:23:46Z @Dinkh referenced in commit `a91949d` - "feature: solving #1087
- Updated the toasts to run without the overhead from dialog
- stacks multiple toasts now
- updated example"

