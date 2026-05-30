---
id: 527
title: 'CleanWebpackPlugin: ignore lazy loaded chunks for the main thread'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-05-02T08:57:19Z'
updatedAt: '2020-05-23T11:01:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/527'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-05-23T11:01:05Z'
---
# CleanWebpackPlugin: ignore lazy loaded chunks for the main thread

right now it will clear the AmCharts mixin, so we need to run another main build after the examples or app builds.

we could either move all main thread related chunks (dynamic imports) into a specific folder or just exclude the new src folder.

## Timeline

- 2020-05-02T08:57:19Z @tobiu added the `enhancement` label
- 2020-05-02T08:57:20Z @tobiu assigned to @tobiu
- 2020-05-23T11:01:05Z @tobiu closed this issue

