---
id: 3794
title: clearFilter() in collection produces an extra item in the map
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2023-01-05T19:30:17Z'
updatedAt: '2023-01-05T20:25:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3794'
author: Dinkh
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-05T20:25:09Z'
---
# clearFilter() in collection produces an extra item in the map

```
Map.filters = [{property: 'running', value: false}];
Map.clearFilters();
```

This seems to be a problem in collectionBase:filter:671
It seems that components are added twice.

## Timeline

- 2023-01-05T19:30:17Z @Dinkh added the `bug` label
- 2023-01-05T19:31:30Z @Dinkh referenced in commit `1c0129b` - "bug: solving #3794"
- 2023-01-05T20:24:16Z @tobiu referenced in commit `9943af5` - "Merge pull request #3795 from neomjs/@bug/Dinkh/clearFilters

bug: solving #3794"
- 2023-01-05T20:25:09Z @tobiu closed this issue

