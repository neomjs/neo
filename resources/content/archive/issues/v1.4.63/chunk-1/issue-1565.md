---
id: 1565
title: SharedWorkers context - Sometimes a demo app fails to load
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2021-03-22T13:40:33Z'
updatedAt: '2021-03-22T22:28:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1565'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-22T22:28:17Z'
---
# SharedWorkers context - Sometimes a demo app fails to load

This one is definitely new, it does affect the shared covid app as well as the new multi window drag&drop demo.

For me, this only happens when reloading the page, not on the initial load.

It also never happens in case the main window console is open (**try it in case this one is affecting you**).

The issue is related to the remote method access.

Each class can expose methods to different threads. they get found on instantiation and immediately trigger a postMessage to the target thread. For me, it is always the `Neo.vdom.Helper.create()` method which is not registered yet.

There is already a delay in place to fire the workerConstructed event, but it no longer seems sufficient.

I will dive into this issue soon, since it does affect the online examples.

Not 100% sure yet if there is a cleaner way to let each thread now how many methods will be registered and delay the start until then. Will think about it more!

## Timeline

- 2021-03-22T13:40:33Z @tobiu added the `bug` label
- 2021-03-22T13:40:33Z @tobiu assigned to @tobiu
- 2021-03-22T22:03:04Z @tobiu referenced in commit `642008e` - "SharedWorkers context - Sometimes a demo app fails to load #1565"
### @tobiu - 2021-03-22T22:07:01Z

While working on app connect & disconnect events, i accidentally removed a connect**ed** event, which is needed for the SharedWorkers context.

In short: singleton instances can get created before a worker is connected, in which case it is not possible to send postMessages to other threads yet to register the remote methods.

combined with the other changes, i think we can now remove the 100ms delay for the workerConstructed event => a faster starting time for your apps.

will deploy a new version now and test it inside the online examples before closing this ticket (in case it works).

### @tobiu - 2021-03-22T22:28:17Z

works fine. loaded the 2 SW apps several times in all 3 modes.

- 2021-03-22T22:28:17Z @tobiu closed this issue

