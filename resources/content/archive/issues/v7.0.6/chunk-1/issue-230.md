---
id: 230
title: 'container.Base: onInsert => parent view handler'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2020-02-04T16:04:22Z'
updatedAt: '2024-08-31T08:56:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/230'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-31T08:56:57Z'
---
# container.Base: onInsert => parent view handler

related to #229

parse items of components inside containers for string based listeners / handlers inside the parent view chain.

should happen before the controllers check them and not throw errors in case there are no matches (since those could be inside the controller(s) scope.

## Timeline

- 2020-02-04T16:04:22Z @tobiu added the `enhancement` label
- 2020-02-04T16:07:28Z @tobiu referenced in commit `a77e3e1` - "RealWorld2.view.user.LoginFormContainer: onLoginButtonClick (moved the item creation into the ctor until #230 is resolved)"
### @tobiu - 2024-08-31T08:56:57Z

already done.

- 2024-08-31T08:56:57Z @tobiu closed this issue

