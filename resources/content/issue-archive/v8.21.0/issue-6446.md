---
id: 6446
title: 'collection.Base: prevent bubbling changes upwards for now'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-02-11T22:57:20Z'
updatedAt: '2025-02-11T23:23:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6446'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-11T23:23:13Z'
---
# collection.Base: prevent bubbling changes upwards for now

* the idea was that adding or removing items from a collection should reflect these changes to its source
* when filtering a collection, this also creates the `allItems` collection with the current collection as its source

the problem is e.g. clearing a store => mutate => clearing the `allItems` collection (correct)

now this would push the same changes upwards again, which must not happen.

needs a follow-up ticket.

## Timeline

- 2025-02-11T22:57:20Z @tobiu added the `enhancement` label
- 2025-02-11T22:57:20Z @tobiu assigned to @tobiu
- 2025-02-11T22:58:12Z @tobiu referenced in commit `2e7f0aa` - "collection.Base: prevent bubbling changes upwards for now #6446"
- 2025-02-11T23:23:13Z @tobiu closed this issue

