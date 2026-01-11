---
id: 6645
title: 'apps/covid, apps/sharedCovid: use fallback API'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-04-14T09:31:44Z'
updatedAt: '2025-04-14T09:48:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6645'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-04-14T09:48:25Z'
---
# apps/covid, apps/sharedCovid: use fallback API

* The disease API is down, and I am not sure if it will come online again or work stable in the future.
* We need an easy way to enable / disable the fallback api (static data)
* `neo-config.json`: add a custom boolean flag => `useFallbackApi: true`
* Adjust `view.MainContainerController`
* Adjust `view.TableContainerController`

## Timeline

- 2025-04-14T09:31:44Z @tobiu added the `enhancement` label
- 2025-04-14T09:35:21Z @tobiu referenced in commit `31da6bf` - "apps/covid, apps/sharedCovid: use fallback API #6645"
- 2025-04-14T09:48:25Z @tobiu closed this issue

