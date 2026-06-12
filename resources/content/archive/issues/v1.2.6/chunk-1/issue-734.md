---
id: 734
title: 'SharedWorker: onDisconnect()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-06-15T06:51:48Z'
updatedAt: '2020-06-15T11:30:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/734'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-06-15T11:30:24Z'
---
# SharedWorker: onDisconnect()

We are still not receiving the window.beforeunload event correctly.

This one is required for the SharedCovid App to reconstruct into its original state.

Looking into it next.

## Timeline

- 2020-06-15T06:51:48Z @tobiu added the `enhancement` label
- 2020-06-15T06:51:48Z @tobiu assigned to @tobiu
- 2020-06-15T06:55:17Z @tobiu cross-referenced by #736
### @tobiu - 2020-06-15T06:55:55Z

related to #669.

- 2020-06-15T08:49:00Z @tobiu referenced in commit `c1f86d1` - "#734 fixed the worker.Manager: broadcast() method"
- 2020-06-15T09:18:29Z @tobiu referenced in commit `1e22a57` - "#734 onAppConnect sends a method the the relevant main thread (port) to store a reference (appName). this one will get passed onDisconnect to reveal which main thread was lost."
- 2020-06-15T09:33:34Z @tobiu referenced in commit `02721e5` - "#734 SharedCovid App: receiving the disconnect event"
- 2020-06-15T09:36:14Z @tobiu referenced in commit `493ac34` - "#734 moved the mainView related event logic from worker.Base to worker.App (not needed for the data & vdom workers)"
- 2020-06-15T10:24:55Z @tobiu referenced in commit `9664f33` - "#734 reconstructing the app when closing the charts window"
- 2020-06-15T10:38:43Z @tobiu referenced in commit `962614b` - "#734 SharedCovid.view.MainContainerController: reconstruction logic for all tabs"
- 2020-06-15T10:49:00Z @tobiu referenced in commit `7b3a3bc` - "#734 tab.Container: not removing the tabButtonConfig and recreating tab header buttons when inserting tab cards"
- 2020-06-15T10:50:37Z @tobiu referenced in commit `d5e0995` - "#734 tab.Container: removed testing log"
- 2020-06-15T11:30:24Z @tobiu closed this issue

