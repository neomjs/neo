---
id: 8055
title: Enable silent VNode creation to avoid Worker Manager deadlocks
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-08T05:54:01Z'
updatedAt: '2025-12-08T05:55:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8055'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-08T05:55:26Z'
---
# Enable silent VNode creation to avoid Worker Manager deadlocks

## Objective
Enable a "silent" VNode creation mode where the VDOM worker can create VNodes without calculating deltas or triggering `autoMount`/`updateVdom` events.

## Problem
In the current `Neo.worker.Manager` implementation, `onWorkerMessage` unconditionally calls `promiseForwardMessage` if `data.data` exists. This pauses execution until `resolveDomOperationPromise` is called.
However, `resolveDomOperationPromise` is typically triggered by `automount` or `updateVdom` event listeners. If neither `autoMount` nor `updateVdom` is true (as in the manual/silent VNode creation case), no event is fired, the promise is never resolved, and the message forwarding hangs indefinitely (deadlock).

## Solution
Modify `src/worker/Manager.mjs` inside `onWorkerMessage` to conditionally use `promiseForwardMessage`. It should only be used if `autoMount` or `updateVdom` is true, indicating a DOM operation that needs to be waited on. Otherwise, the message should be forwarded immediately.

### Implementation Details
```javascript
if (!promise) {
    if (data.data) {
        if (data.data.autoMount || data.data.updateVdom) {
            data.data.autoMount  && me.fire('automount',  data);
            data.data.updateVdom && me.fire('updateVdom', data);

            // We want to delay the message until the rendering queue has processed it
            // See: https://github.com/neomjs/neo/issues/2864
            me.promiseForwardMessage(data).then(msgData => {
                me.sendMessage(msgData.destination, msgData)
            })
        } else {
            me.sendMessage(dest, data)
        }
    }
}
```

This logic has already been verified in `src/worker/Manager.mjs`. This ticket tracks the formal acceptance and documentation of this capability.

## Timeline

- 2025-12-08T05:54:02Z @tobiu added the `enhancement` label
- 2025-12-08T05:54:02Z @tobiu added the `ai` label
- 2025-12-08T05:54:02Z @tobiu added the `refactoring` label
- 2025-12-08T05:54:12Z @tobiu assigned to @tobiu
- 2025-12-08T05:54:51Z @tobiu referenced in commit `28c859d` - "Enable silent VNode creation to avoid Worker Manager deadlocks #8055"
- 2025-12-08T05:55:26Z @tobiu closed this issue

