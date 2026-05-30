---
id: 4192
title: 'list.Base: scrollIntoViewOnFocus'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-03-14T11:40:02Z'
updatedAt: '2023-03-14T11:40:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4192'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-03-14T11:40:44Z'
---
# list.Base: scrollIntoViewOnFocus

in case a list is using headers, `DomAccess.scrollIntoView()` can have odd side effects => scrolling in a way, that the focused item is not visible.

the new config will be set to true for lists without headers and false otherwise.

## Timeline

- 2023-03-14T11:40:03Z @tobiu added the `enhancement` label
- 2023-03-14T11:40:03Z @tobiu assigned to @tobiu
- 2023-03-14T11:40:39Z @tobiu referenced in commit `1d28d31` - "list.Base: scrollIntoViewOnFocus #4192"
- 2023-03-14T11:40:44Z @tobiu closed this issue

