---
id: 6954
title: 'collection.Base: pass a shallow copy of items to the creation of allItems'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-05T22:12:23Z'
updatedAt: '2025-07-05T22:14:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6954'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-05T22:14:01Z'
---
# collection.Base: pass a shallow copy of items to the creation of allItems

* after introducing the reactive `count_` config, one unit test broke.
* i will update the tests to switch from `getCount()` to `count`, since the get method is deprecated.

## Timeline

- 2025-07-05T22:12:24Z @tobiu added the `enhancement` label
- 2025-07-05T22:12:27Z @tobiu assigned to @tobiu
- 2025-07-05T22:12:58Z @tobiu referenced in commit `30f4b97` - "collection.Base: pass a shallow copy of items to the creation of allItems #6954"
- 2025-07-05T22:14:01Z @tobiu closed this issue
- 2025-07-05T22:35:25Z @tobiu referenced in commit `bc4ed73` - "collection.Base: pass a shallow copy of items to the creation of allItems #6954"

