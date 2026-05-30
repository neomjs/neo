---
id: 3289
title: 'collection.Base: clear() => use splice()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-07-15T15:56:33Z'
updatedAt: '2022-07-15T16:11:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3289'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-07-15T16:11:15Z'
---
# collection.Base: clear() => use splice()

the current shortcut is a little bit faster, but lacking the `mutate` - event, which is especially important when child collections (`sourceId`) are in use.

## Timeline

- 2022-07-15T15:56:33Z @tobiu added the `enhancement` label
- 2022-07-15T15:56:33Z @tobiu assigned to @tobiu
- 2022-07-15T15:57:51Z @tobiu referenced in commit `acde67f` - "collection.Base: clear() => use splice() #3289"
- 2022-07-15T16:11:15Z @tobiu closed this issue

