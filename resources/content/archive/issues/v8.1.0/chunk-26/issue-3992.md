---
id: 3992
title: 'button.Base: add theming variables for secondary & tertiary UIs'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-02-06T12:09:27Z'
updatedAt: '2023-02-06T12:36:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3992'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-02-06T12:36:50Z'
---
# button.Base: add theming variables for secondary & tertiary UIs

@mxmrtns

the logic should still default to toggling colors for secondary and removing the border for tertiary, but it should be based on css variables, so that we can change it inside a custom theme.

## Timeline

- 2023-02-06T12:09:27Z @tobiu added the `enhancement` label
- 2023-02-06T12:09:27Z @tobiu assigned to @tobiu
- 2023-02-06T12:36:01Z @tobiu referenced in commit `61b254a` - "button.Base: add theming variables for secondary & tertiary UIs #3992"
### @tobiu - 2023-02-06T12:36:50Z

the current solution is based on the css variables mode. we need a new ticket to make it work for the non css vars based theme mode.

- 2023-02-06T12:36:50Z @tobiu closed this issue

