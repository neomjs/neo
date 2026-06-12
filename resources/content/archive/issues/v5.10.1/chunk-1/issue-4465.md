---
id: 4465
title: 'dialog.header.Toolbar: do not render title nodes without content'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-05-26T10:37:44Z'
updatedAt: '2023-05-26T10:38:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4465'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-05-26T10:38:40Z'
---
# dialog.header.Toolbar: do not render title nodes without content

the logic is using `removeDom` (a vdom attribute) on component level => it needs to get changed to `hidden`

## Timeline

- 2023-05-26T10:37:44Z @tobiu added the `bug` label
- 2023-05-26T10:37:44Z @tobiu assigned to @tobiu
### @tobiu - 2023-05-26T10:37:54Z

@pensuwan-k 

- 2023-05-26T10:38:22Z @tobiu referenced in commit `4cb7d33` - "dialog.header.Toolbar: do not render title nodes without content #4465"
- 2023-05-26T10:38:41Z @tobiu closed this issue

