---
id: 698
title: 'Main: register remotes to workers'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-06-08T19:15:56Z'
updatedAt: '2020-06-10T20:00:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/698'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-06-10T20:00:08Z'
---
# Main: register remotes to workers

In case multiple main threads connect, they must only expose remote methods to other workers once.

A bit tricky, since main threads can use different addons (which can have their own remote methods).

The other option is to adjust the adding remotes logic to ensure it stays unique.

Need to think a bit more about this one.

## Timeline

- 2020-06-08T19:15:56Z @tobiu added the `enhancement` label
- 2020-06-08T19:15:56Z @tobiu assigned to @tobiu
- 2020-06-10T19:58:14Z @tobiu referenced in commit `59a2a40` - "Main: register remotes to workers #698"
- 2020-06-10T20:00:08Z @tobiu closed this issue

