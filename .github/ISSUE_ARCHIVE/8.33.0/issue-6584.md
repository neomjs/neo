---
id: 6584
title: Polishing the ServiceWorker implementation
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-03-25T10:27:42Z'
updatedAt: '2025-03-25T17:32:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6584'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - 6585
  - 6586
  - 6587
  - 6588
  - 6589
  - 6590
  - 6591
subIssuesCompleted: 7
subIssuesTotal: 7
blockedBy: []
blocking: []
closedAt: '2025-03-25T17:32:37Z'
---
# Polishing the ServiceWorker implementation

While the current implementation works fine for caching related assets and even predictive caching via a `MessageChannel` connection to the app worker, it sometimes faces issues when deploying a new framework version to the online examples & website.

My assumption is, that the `registerNeoConfig` message arrives too late. Webpack can create different bundle file names, a previously cached asset is no longer available, which might result in a bug inside a main-thread and thus can prevent a reload.

Let's see if @dfabulich 's old guide can help a bit:
https://redfin.engineering/how-to-fix-the-refresh-button-when-using-service-workers-a8e27af6df68

I will create sub-tasks (tickets).

## Comments

### @tobiu - 2025-03-25 17:32

https://youtu.be/UG1JOeUSyEU

## Activity Log

- 2025-03-25 @tobiu added the `enhancement` label
- 2025-03-25 @tobiu assigned to @tobiu
- 2025-03-25 @tobiu closed this issue

