---
id: 192
title: The webkit dependency fsevents breaks on MacOS Catalina
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2019-12-20T21:57:20Z'
updatedAt: '2019-12-20T22:01:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/192'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2019-12-20T22:01:01Z'
---
# The webkit dependency fsevents breaks on MacOS Catalina

> "fsevents": "1.2.9", // npm i breaks without the specific include on MacOS Catalina

this does require a new npm package version

## Timeline

- 2019-12-20T21:57:20Z @tobiu added the `bug` label
- 2019-12-20T21:57:21Z @tobiu assigned to @tobiu
- 2019-12-20T21:57:56Z @tobiu referenced in commit `0564c1c` - "The webkit dependency fsevents breaks on MacOS Catalina #192"
### @tobiu - 2019-12-20T22:00:50Z

todo: we can remove the dependency once fsevents does support catalina

- 2019-12-20T22:01:01Z @tobiu closed this issue

