---
id: 1773
title: 'main.DomEvents: onHashChange() => appNames'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2021-04-14T15:46:29Z'
updatedAt: '2021-04-14T15:47:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1773'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-14T15:47:20Z'
---
# main.DomEvents: onHashChange() => appNames

for the shared workers context, the send message call is submitting `Manager.appName`.

`worker.Manager` got adjusted to support multiple appNames, so we need to submit the new array instead.

## Timeline

- 2021-04-14T15:46:29Z @tobiu added the `bug` label
- 2021-04-14T15:46:29Z @tobiu assigned to @tobiu
- 2021-04-14T15:47:14Z @tobiu referenced in commit `40eaf40` - "main.DomEvents: onHashChange() => appNames #1773"
- 2021-04-14T15:47:20Z @tobiu closed this issue

