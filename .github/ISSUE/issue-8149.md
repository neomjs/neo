---
id: 8149
title: 'Architecture: Migrate from ''main'' destination to explicit Window IDs'
state: OPEN
labels:
  - enhancement
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-19T22:27:50Z'
updatedAt: '2025-12-19T23:13:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8149'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Architecture: Migrate from 'main' destination to explicit Window IDs

This epic proposes a fundamental architectural shift to **replace** the ambiguous `destination: 'main'` with explicit `windowId`s for all cross-worker communication.

**The Problem:**
In a multi-window environment (SharedWorker), "Main" is a relative term. To the App Worker, multiple connected windows are just different clients (ports).
Currently, code uses `sendMessage('main', {windowId: '...'})`. This relies on `Neo.worker.Base#sendMessage` inspecting the *options* to find the correct port, with a dangerous fallback to `ports[0]` if the ID is missing.

**The Solution:**
Stop using the generic string `'main'` as a destination. Instead, `sendMessage` should accept the target `windowId` directly as the `destination` argument.

**Target API:**
```javascript
// Old
Neo.currentWorker.sendMessage('main', {windowId: 'uuid-123', action: 'foo'});

// New
Neo.currentWorker.sendMessage('uuid-123', {action: 'foo'});
```

**Benefits:**
1.  **Ambiguity Elimination:** "Main" as a concept disappears from the routing layer. The destination is always a specific, absolute client.
2.  **Routing Simplicity:** `sendMessage` becomes a simple lookup: `ports[dest]`. No complex `if/else` logic to check options for IDs.
3.  **Debugging:** Logs like `destination: "uuid-123"` are instantly clear.
4.  **Future-Proofing:** Aligns with a distributed computing model where the "main thread" is just one of many peers.

**Implementation Strategy (Phased):**

*   **Phase 1: Hybrid Support (Core Refactoring):**
    *   Update `Neo.worker.Base#sendMessage` to treat the `dest` argument as a potential `windowId` or `portId`.
    *   If `dest` matches a connected port's ID or Window ID, route to it directly.
    *   Retain `'main'` support for backward compatibility.

*   **Phase 2: Caller Migration:**
    *   Update `RemoteMethodAccess` to use the `origin` (which should be a window ID) as the `destination` for replies.
    *   Update manual calls (e.g., `App.applyDeltas`) to pass `windowId` as the first argument.

*   **Phase 3: Deprecation & Removal:**
    *   Log warnings when `destination: 'main'` is used in a SharedWorker context.
    *   Eventually remove support for `'main'` as a destination string entirely.


## Comments

### @tobiu - 2025-12-19 23:13

**Input from Gemini 2.5 pro:**

> ✦ Progress Update: **Phase 1 Complete & Phase 2 In Progress**
> 
> We have successfully implemented the core architectural changes in commit `80047446741083289a7d1a3a0ec0f76320e9ad58`.
> 
> **Completed Items:**
> 1.  **Hybrid Routing Support:** `Neo.worker.Base#sendMessage` now accepts `windowId` (or port ID) directly as a destination, bypassing the legacy `'main'` fallback logic.
> 2.  **Manager Routing:** `Neo.worker.Manager` now treats its own `windowId` as equivalent to `'main'`, enabling precise targeting.
> 3.  **Auto-Migration for Remote Methods:** `RemoteMethodAccess` now automatically promotes the destination from `'main'` to `windowId` if the method payload contains a `windowId`. It also cleans the payload by removing the redundant `windowId` property.
> 4.  **Manual Migration:** Critical methods like `App.applyDeltas` and `registerApp` have been manually updated to use the new routing scheme.
> 
> **Current State:**
> The system is in a "Hybrid" state. New code (and auto-migrated remote calls) uses the strict `windowId` routing. Legacy code using `'main'` will continue to work but will now trigger a **deprecation warning** in the console when running in a SharedWorker environment.
> 
> **Next Steps:**
> Monitor the console for `sendMessage destination "main" is deprecated` warnings to identify and migrate any remaining edge cases (e.g., third-party addons or manual `sendMessage` calls).

## Activity Log

- 2025-12-19 @tobiu added the `enhancement` label
- 2025-12-19 @tobiu added the `epic` label
- 2025-12-19 @tobiu added the `ai` label
- 2025-12-19 @tobiu added the `architecture` label
- 2025-12-19 @tobiu assigned to @tobiu
- 2025-12-19 @tobiu referenced in commit `8004744` - "#8149 phase 1"
- 2025-12-19 @tobiu referenced in commit `9d58900` - "#8149 wip"
- 2025-12-20 @tobiu cross-referenced by #8150

