---
id: 2792
title: 'collection.Base: filter() => removing filters'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-01-02T18:49:47Z'
updatedAt: '2022-01-02T18:57:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2792'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-01-02T18:57:10Z'
---
# collection.Base: filter() => removing filters

removing filters does not honor sorters yet.

we need to modiy `doSort()` to trigger a sort on the filtered items in this edge case, without firing the `sort` event.

## Timeline

- 2022-01-02T18:49:47Z @tobiu added the `enhancement` label
- 2022-01-02T18:49:47Z @tobiu assigned to @tobiu
- 2022-01-02T18:57:07Z @tobiu referenced in commit `8173fed` - "collection.Base: filter() => removing filters #2792"
- 2022-01-02T18:57:10Z @tobiu closed this issue

