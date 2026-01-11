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
  - '[x] 6585 worker.ServiceBase: create a separate cache for each version'
  - '[x] 6586 worker.ServiceBase: onInstall() => remove the skipWaiting() call'
  - '[x] 6587 worker.Manager: add controllerchange SW listener as early as possible'
  - '[x] 6588 worker.ServiceBase: onFetch() => limit caching to event.request.method === ''GET'''
  - '[x] 6589 main.addon.ServiceWorker: registerServiceWorker()'
  - '[x] 6590 main.addon.ServiceWorker: registerServiceWorker() => updatefound listener'
  - '[x] 6591 worker.ServiceBase: onActivate() => clear previous caches'
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

## Timeline

- 2025-03-25T10:27:42Z @tobiu added the `enhancement` label
- 2025-03-25T10:27:42Z @tobiu assigned to @tobiu
- 2025-03-25T10:29:17Z @tobiu added sub-issue #6585
- 2025-03-25T10:30:37Z @tobiu added sub-issue #6586
- 2025-03-25T10:33:31Z @tobiu added sub-issue #6587
- 2025-03-25T10:36:16Z @tobiu added sub-issue #6588
- 2025-03-25T13:06:10Z @tobiu added sub-issue #6589
- 2025-03-25T17:13:43Z @tobiu added sub-issue #6590
- 2025-03-25T17:17:57Z @tobiu added sub-issue #6591
### @tobiu - 2025-03-25T17:32:37Z

https://youtu.be/UG1JOeUSyEU

- 2025-03-25T17:32:37Z @tobiu closed this issue

