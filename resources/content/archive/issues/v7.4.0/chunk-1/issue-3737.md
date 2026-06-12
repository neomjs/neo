---
id: 3737
title: Store loading catch error not working
state: CLOSED
labels:
  - bug
  - stale
assignees: []
createdAt: '2023-01-02T01:10:40Z'
updatedAt: '2024-09-14T02:26:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3737'
author: Dinkh
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-14T02:26:25Z'
---
# Store loading catch error not working

If the url for a store is not working (404) it is not getting into the promiseJson catch part but the then part.
And there it crashes.
```
Neo.Xhr.promiseJson({
    url: params.url
}).catch(err => {
    console.log('Error for Neo.Xhr.request', err, me.id);
}).then(data => {
//==> here instead of above
    me.data = Array.isArray(data.json) ? data.json : data.json.data;
    // we do not need to fire a load event => onCollectionMutate()
});
```

To reproduce just set the store url to
```
    url: 'http://test.json'
```

## Timeline

- 2023-01-02T01:10:40Z @Dinkh added the `bug` label
### @github-actions - 2024-08-30T02:27:24Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:27:24Z @github-actions added the `stale` label
### @github-actions - 2024-09-14T02:26:24Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-14T02:26:25Z @github-actions closed this issue

