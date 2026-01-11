---
id: 7815
title: 'Fix race condition: Await addon initialization in Neo.Main'
state: CLOSED
labels:
  - bug
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-19T17:06:52Z'
updatedAt: '2025-11-19T17:11:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7815'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-19T17:11:44Z'
---
# Fix race condition: Await addon initialization in Neo.Main

A race condition in `Neo.Main` can cause the App Worker to crash if `loadApplication` is sent before all Main Thread addons have registered their remote methods.

**Root Cause:**
`registerAddon` creates addon instances, which register their remote methods asynchronously (in `initAsync`). However, `onDomContentLoaded` does not wait for this process to complete before signaling that the Main thread is ready (`WorkerManager.onWorkerConstructed`). This can lead to the `loadApplication` message (triggered by `WorkerManager`) arriving at the App Worker before the `registerRemote` messages.

**Solution:**
Modify `Neo.Main` to ensure all registered addons are fully initialized (specifically, that they have executed `initAsync` and sent their `registerRemote` messages) before notifying the `WorkerManager`.

**Implementation:**
1.  Update `registerAddon` to return the addon instance.
2.  Update `onDomContentLoaded` to collect these instances.
3.  Await `Promise.all(instances.map(addon => addon.ready()))` to ensure all addons have completed their async initialization.
4.  Only then call `WorkerManager.onWorkerConstructed`.

This guarantees that the `registerRemote` messages are pushed to the message queue before the `loadApplication` sequence begins.

**Affected File:**
- `src/Main.mjs`

## Timeline

- 2025-11-19T17:06:54Z @tobiu added the `bug` label
- 2025-11-19T17:06:54Z @tobiu added the `refactoring` label
- 2025-11-19T17:07:07Z @tobiu assigned to @tobiu
- 2025-11-19T17:07:39Z @tobiu changed title from **Fix race condition: Await addon initialization in Neo.main.Main** to **Fix race condition: Await addon initialization in Neo.Main**
- 2025-11-19T17:11:40Z @tobiu referenced in commit `dc48095` - "Fix race condition: Await addon initialization in Neo.Main #7815"
- 2025-11-19T17:11:45Z @tobiu closed this issue

