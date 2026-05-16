---
id: 2015
title: 'fetch calls (apps, examples) => then, catch order'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-05-10T10:31:50Z'
updatedAt: '2021-05-10T10:57:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2015'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-05-10T10:57:19Z'
---
# fetch calls (apps, examples) => then, catch order

old:
```
        fetch(url)
            .then(response => response.json())
            .then(data => me.addStoreItems(data))
            .catch(err => console.log('Can’t access ' + url, err));
```

new:
```
        fetch(url)
            .then(response => response.json())
            .catch(err => console.log('Can’t access ' + url, err))
            .then(data => me.addStoreItems(data));
```

we only want the catch error for failed requests and not for errors inside the callback.

## Timeline

- 2021-05-10T10:31:50Z @tobiu added the `enhancement` label
- 2021-05-10T10:31:50Z @tobiu assigned to @tobiu
- 2021-05-10T10:33:03Z @tobiu referenced in commit `38e5541` - "fetch calls (apps, examples) => then, catch order #2015"
- 2021-05-10T10:57:19Z @tobiu closed this issue

