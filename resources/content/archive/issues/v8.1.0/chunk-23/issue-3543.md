---
id: 3543
title: buildScripts/injectPackageVersion
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-10-22T14:04:25Z'
updatedAt: '2022-11-06T19:52:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3543'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-11-06T19:52:39Z'
---
# buildScripts/injectPackageVersion

for the framework scope, the script needs to inject the neo version into the DefaultConfig.mjs as well as the service worker.

for the workspace scope, we could add the package version into all app related neo-config.json files and add this one into the SW as well.

## Timeline

- 2022-10-22T14:04:26Z @tobiu added the `enhancement` label
- 2022-10-22T14:04:26Z @tobiu assigned to @tobiu
- 2022-10-25T19:10:02Z @tobiu referenced in commit `5a9a07f` - "buildScripts/injectPackageVersion #3543: first program setup (in progress)"
- 2022-10-25T19:16:23Z @tobiu referenced in commit `b4f70a3` - "#3543 DefaultConfig.mjs: added the neo version"
- 2022-10-25T20:29:57Z @tobiu referenced in commit `19b1160` - "#3543 buildScripts/injectPackageVersion: adjusting the version inside the DefaultConfig.mjs"
- 2022-11-06T17:53:39Z @tobiu referenced in commit `1d65102` - "#3543 Neo.ServiceWorker: version_ (moved from ServiceBase.mjs)"
- 2022-11-06T17:59:17Z @tobiu referenced in commit `e9e9c9d` - "#3543 buildScripts/injectPackageVersion: updating the neo version inside the ServiceWorker"
- 2022-11-06T18:15:49Z @tobiu referenced in commit `9119063` - "#3543 buildScripts/injectPackageVersion: update the SW version inside the examples & apps folder for the neo framework scope"
- 2022-11-06T18:22:14Z @tobiu referenced in commit `c196d43` - "#3543 worker.ServiceBase: clearing the caches once a new app version connects"
### @tobiu - 2022-11-06T19:52:39Z

closing this ticket (resolved for the framework scope) and will add a new ticket for the workspace scope.

- 2022-11-06T19:52:39Z @tobiu closed this issue

