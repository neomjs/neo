---
id: 7025
title: 'Fix: EffectBatchManager.endBatch() Infinite Loop Prevention'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-12T17:54:47Z'
updatedAt: '2025-07-12T17:56:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7025'
author: tobiu
commentsCount: 0
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-12T17:56:58Z'
---
# Fix: EffectBatchManager.endBatch() Infinite Loop Prevention

**Describe the bug**
The `EffectBatchManager.endBatch()` method, responsible for executing pending effects, had a subtle bug that could lead to an infinite loop. If an effect being run within the `forEach` loop caused another effect (or itself) to be re-queued into `pendingEffects` synchronously, it could result in the `forEach` iterating indefinitely or triggering subsequent `endBatch()` calls in a recursive manner.

**To Reproduce**
Steps to reproduce the behavior:
1.  Have an `Neo.core.Effect` (Effect A) that, when run, triggers a reactive change.
2.  Have another `Neo.core.Effect` (Effect B) that depends on the reactive change caused by Effect A.
3.  If Effect A is processed by `EffectBatchManager.endBatch()` and its execution synchronously causes Effect B to be re-queued into `pendingEffects` (or if Effect A itself is re-queued), it could lead to an infinite loop within the `endBatch()`'s `forEach` iteration.

**Expected behavior**
The `EffectBatchManager.endBatch()` should process all pending effects in a given batch without re-triggering effects within the same batch, even if their execution causes new effects to be queued.

**Solution**
To prevent this, `EffectBatchManager.endBatch()` now creates a snapshot of `pendingEffects` (using `Array.from()`) and clears the original `pendingEffects` Set *before* iterating and running the effects. This ensures that any new effects queued during the execution of the current batch are added to a *new* batch, preventing interference with the current processing and breaking the synchronous infinite loop.

**Impact**
This bug could lead to application freezes and "Maximum call stack size exceeded" errors in scenarios where effects trigger other effects synchronously within a batch.

**Affected Files**
`src/core/EffectBatchManager.mjs`

## Timeline

- 2025-07-12T17:54:47Z @tobiu assigned to @tobiu
- 2025-07-12T17:54:48Z @tobiu added the `enhancement` label
- 2025-07-12T17:56:51Z @tobiu referenced in commit `98ff9b1` - "Fix: EffectBatchManager.endBatch() Infinite Loop Prevention #7025"
- 2025-07-12T17:56:59Z @tobiu closed this issue
- 2025-07-12T18:27:59Z @tobiu added parent issue #6992

