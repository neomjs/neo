---
id: 3738
title: 'Component needs getParents() that returns array of parents up the containment hierarchy. '
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2023-01-02T18:06:30Z'
updatedAt: '2023-01-04T20:33:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3738'
author: maxrahder
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-04T20:33:02Z'
---
# Component needs getParents() that returns array of parents up the containment hierarchy. 

Something like this?
```
getParents(){
    return Neo.manager.Component.getParents(this);
}

```

## Timeline

- 2023-01-02T18:06:30Z @maxrahder added the `enhancement` label
- 2023-01-02T19:38:02Z @Dinkh referenced in commit `0a47be1` - "#3738 Components need getParents for debugging

As stated in the ticket #3738 we need getParents on a Component for debugging."
- 2023-01-02T19:38:34Z @Dinkh cross-referenced by PR #3740
### @Dinkh - 2023-01-02T19:39:32Z

Currently solved in Pull Requst 

- 2023-01-04T11:40:12Z @tobiu referenced in commit `bbe9087` - "Merge pull request #3740 from neomjs/Dinkh-patch-getParents

Components need getParents for debugging Ticket #3738"
- 2023-01-04T20:33:02Z @Dinkh closed this issue

