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
closedAt: '2025-07-05T22:14:01Z'
---
# collection.Base: pass a shallow copy of items to the creation of allItems

**Reported by:** @tobiu on 2025-07-05

* after introducing the reactive `count_` config, one unit test broke.
* i will update the tests to switch from `getCount()` to `count`, since the get method is deprecated.

