---
id: 381
title: 'NovelCOVID/API: dynamic check if the API is down'
state: CLOSED
labels:
  - enhancement
  - help wanted
assignees: []
createdAt: '2020-03-26T16:35:22Z'
updatedAt: '2020-03-26T18:22:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/381'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-03-26T18:22:05Z'
---
# NovelCOVID/API: dynamic check if the API is down

We need to check the API to see if it is down and provide visual feedback inside the dashboard UI.

Right now this is rather annoying: in case the API server is down, we get CORS error logs inside the console.

=> the not existing response has no CORS headers. Might be worth creating a ticket on chromium, since this is misleading.

## Timeline

- 2020-03-26T16:35:22Z @tobiu added the `enhancement` label
- 2020-03-26T16:35:22Z @tobiu added the `help wanted` label
- 2020-03-26T18:21:56Z @tobiu referenced in commit `6f58b59` - "https://github.com/neomjs/neo/issues/381"
### @tobiu - 2020-03-26T18:22:05Z

![Screenshot 2020-03-26 at 19 21 13](https://user-images.githubusercontent.com/1177434/77682332-10c03c00-6f97-11ea-9c52-71df241d376d.png)


- 2020-03-26T18:22:05Z @tobiu closed this issue

