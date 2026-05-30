---
id: 5157
title: 'controller.Base: using default inside routes breaks'
state: CLOSED
labels:
  - bug
assignees:
  - ThorstenRaab
createdAt: '2023-12-05T18:53:21Z'
updatedAt: '2023-12-07T20:01:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5157'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-12-07T20:01:32Z'
---
# controller.Base: using default inside routes breaks

use case:
```
        routes: {
            '/home'  : 'onHomeRoute',
            '/learn' : 'onLearnRoute',
            'default': 'onHomeRoute'
        }
```

result:
<img width="397" alt="Screenshot 2023-12-05 at 19 51 42" src="https://github.com/neomjs/neo/assets/1177434/5dd9c4a3-7b39-471f-b6d4-27ab82c976b6">

## Timeline

- 2023-12-05T18:53:21Z @tobiu added the `bug` label
- 2023-12-05T18:53:21Z @tobiu assigned to @ThorstenRaab
### @ThorstenRaab - 2023-12-06T12:57:35Z

let us discuss. Currently 'default' is an own property defaultRoute.

- 2023-12-07T20:01:32Z @tobiu closed this issue

