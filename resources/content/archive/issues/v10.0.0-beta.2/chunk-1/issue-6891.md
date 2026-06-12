---
id: 6891
title: 'addon.Base: intercept remotes which arrive before isReady equals true'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-06-29T09:15:44Z'
updatedAt: '2025-06-29T11:23:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6891'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-29T11:23:27Z'
---
# addon.Base: intercept remotes which arrive before isReady equals true

* Common use case: files are not loaded yet.
* We need to solve this one generically => `worker.mixin.RemoteMethodAccess`, since other singletons can use it too.

## Timeline

- 2025-06-29T09:15:45Z @tobiu added the `enhancement` label
- 2025-06-29T10:27:17Z @tobiu referenced in commit `b839158` - "addon.Base: intercept remotes which arrive before isReady equals true #6891"
- 2025-06-29T11:07:40Z @tobiu referenced in commit `559e283` - "#6891 updated the main thread addons guide, to mention how to use `interceptRemotes` and how automatic method caching works."
- 2025-06-29T11:15:31Z @tobiu referenced in commit `4346736` - "#6891 main.addon.AmCharts"
- 2025-06-29T11:23:27Z @tobiu closed this issue

