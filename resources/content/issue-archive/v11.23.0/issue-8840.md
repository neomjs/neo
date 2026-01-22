---
id: 8840
title: 'VDOM Lifecycle: Fix Merge Race Condition and Async Destruction'
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-20T23:15:34Z'
updatedAt: '2026-01-20T23:17:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8840'
author: tobiu
commentsCount: 1
parentIssue: 8834
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-20T23:17:06Z'
---
# VDOM Lifecycle: Fix Merge Race Condition and Async Destruction

## Objective
Fix critical race conditions in the VDOM update lifecycle that caused dropped updates and test timeouts.

## Issues
1.  **Late-Merge Data Loss**: If a child merged into a parent *after* the parent started collecting payloads but *before* the parent finished, the parent's completion logic (`executeCallbacks`) would "acknowledge" the merge (and delete it from the registry) even though the payload was never generated.
2.  **Async Destruction Hangs**: `promiseUpdate()` returned a new Promise that wasn't tied to the component's destruction lifecycle, causing indefinite hangs if `destroy()` was called while an update was pending.

## Fixes
1.  **Snapshot Logic**: Modified `VdomLifecycle.executeVdomUpdate` to capture a snapshot of `mergedChildIds` during the collection phase. This snapshot is passed to `resolveVdomUpdate`, ensuring we only acknowledge/clear merges that were *actually* processed. Late arrivals remain in the registry for the next cycle.
2.  **Async Registration**: Updated `promiseUpdate` to use `registerAsync` (Base.trap pattern), ensuring the promise rejects with `Neo.isDestroyed` if the component dies.
3.  **Collision Filtering**: Confirmed robustness of `Collision Filtering` logic.
4.  **Test Stabilization**: Updated `RaceCondition.spec.mjs` and `AsyncDestruction.spec.mjs` to verify these fixes.

## Timeline

- 2026-01-20T23:15:35Z @tobiu added the `bug` label
- 2026-01-20T23:15:35Z @tobiu added the `ai` label
- 2026-01-20T23:15:35Z @tobiu added the `core` label
- 2026-01-20T23:15:47Z @tobiu added parent issue #8834
- 2026-01-20T23:16:05Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-20T23:16:44Z

**Input from Gemini 3 Pro:**

> ✦ I have resolved the critical race conditions and test failures.
> 
> 1.  **Race Condition Fix (Snapshot Logic)**: Modified `executeVdomUpdate` to snapshot `mergedChildIds` during payload collection. This ensures that late-arriving merges (which occur after collection but before resolution) are **not** cleared from the registry, forcing them to wait for the next update cycle instead of being silently dropped.
> 2.  **Async Destruction Fix**: Updated `promiseUpdate` to use `registerAsync`, ensuring pending update promises are rejected if the component is destroyed.
> 3.  **Verification**: All 248 unit tests (including `RaceCondition` and `AsyncDestruction`) are passing.
> 
> This ensures the stability of the new Teleportation/Hybrid architecture under high concurrency.

- 2026-01-20T23:17:06Z @tobiu closed this issue

