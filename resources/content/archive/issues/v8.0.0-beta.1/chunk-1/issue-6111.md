---
id: 6111
title: 'component.Base: afterSetIsLoading() => findIndex() => findLastIndex'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-11-14T17:07:51Z'
updatedAt: '2024-11-14T17:08:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6111'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-14T17:08:53Z'
---
# component.Base: afterSetIsLoading() => findIndex() => findLastIndex

I know this one is close to overengineering :)

IF a component has a really big amount of direct child items (e.g. root UL tag which 100s of LI child nodes), we can find the target node a tiny bit faster in case we are iterating backwards over the array, since we are adding the load mask as the last child item.

## Timeline

- 2024-11-14T17:07:51Z @tobiu added the `enhancement` label
- 2024-11-14T17:07:51Z @tobiu assigned to @tobiu
- 2024-11-14T17:08:13Z @tobiu referenced in commit `e0360cc` - "component.Base: afterSetIsLoading() => findIndex() => findLastIndex #6111"
- 2024-11-14T17:08:53Z @tobiu closed this issue

