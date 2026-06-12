---
id: 3551
title: 'main.addon.ServiceWorker: registerNeoConfig'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-11-06T20:03:21Z'
updatedAt: '2022-11-06T20:15:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3551'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-11-06T20:05:28Z'
---
# main.addon.ServiceWorker: registerNeoConfig

navigator.serviceWorker.controller can be null in case we load a page for the first time or in case of a force refresh.

See: https://www.w3.org/TR/service-workers/#navigator-service-worker-controller

Only in this case `main.addon.ServiceWorker` will store the active registration once ready inside `worker.Manager` to ensure the access and prevent JS errors.

@Dinkh 

## Timeline

- 2022-11-06T20:03:21Z @tobiu added the `enhancement` label
- 2022-11-06T20:03:21Z @tobiu assigned to @tobiu
- 2022-11-06T20:03:57Z @tobiu referenced in commit `6a1e22c` - "main.addon.ServiceWorker: registerNeoConfig #3551"
### @tobiu - 2022-11-06T20:05:28Z

i did not find a cleaner approach and this workaround needs testing (works fine for me locally at least).

please add comments in case there are further problems and we can reopen the ticket.

 I did try `globalThis.clients.claim()` without success inside `worker.ServiceBase: onActivate()`.

- 2022-11-06T20:05:29Z @tobiu closed this issue

