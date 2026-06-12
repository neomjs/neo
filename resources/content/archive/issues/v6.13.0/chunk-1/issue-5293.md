---
id: 5293
title: 'Portal.view.learn.ContentTreeList: child tree items are now longer showing'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-03-04T16:58:49Z'
updatedAt: '2024-03-04T16:59:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5293'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-03-04T16:59:48Z'
---
# Portal.view.learn.ContentTreeList: child tree items are now longer showing

this is related to the `data.RecordFactory` changes which do a stricter check on the field types `int` and `float`.

inside the related model, parentId needs to get adjusted to be a string.

## Timeline

- 2024-03-04T16:58:49Z @tobiu added the `bug` label
- 2024-03-04T16:58:49Z @tobiu assigned to @tobiu
- 2024-03-04T16:59:43Z @tobiu referenced in commit `ba96478` - "Portal.view.learn.ContentTreeList: child tree items are now longer showing #5293"
- 2024-03-04T16:59:48Z @tobiu closed this issue
- 2024-03-26T16:29:38Z @tobiu referenced in commit `2609049` - "Portal.view.learn.ContentTreeList: child tree items are now longer showing #5293"

