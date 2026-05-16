---
id: 8131
title: 'Main.mjs: Consolidate queues into Read/Write model'
state: CLOSED
labels:
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-16T20:14:01Z'
updatedAt: '2025-12-16T20:54:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8131'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-16T20:54:26Z'
---
# Main.mjs: Consolidate queues into Read/Write model

The `Neo.Main` class currently manages three queues: `readQueue`, `updateQueue`, and `writeQueue`. Historically, `writeQueue` was intended for initial renders and `updateQueue` for subsequent updates.

**Goal:**
Simplify the architecture to a strict **Read/Write** model, aligning with standard DOM batching practices (like FastDOM).

**Plan:**
1.  **Rename/Consolidate:**
    -   Rename the current `updateQueue` to `writeQueue`.
    -   Remove the *old* `writeQueue` (and its associated logic).
    -   Effectively, all DOM modifications (inserts, updates, moves, removes) will now live in the `writeQueue`.
2.  **Refactor `Neo.Main`:**
    -   Update `renderFrame` to process only `readQueue` and the new `writeQueue`.
    -   Update `queueUpdate` -> `queueWrite`.
    -   Ensure `onRender` (if it still exists/is used) and `onUpdateVdom` both feed into this single `writeQueue`.
    -   Remove `mode === 'update'` logic.
3.  **Refactor `processQueue`:**
    -   Handle operations based on their content/type if necessary, but primarily just delegate to `DeltaUpdates`.
    -   `DeltaUpdates` methods (`update`, `insertNode`) should be unified or handled generically. Actually, `DeltaUpdates.update` handles all delta types including `insertNode` (via action). So we might just need to call `DeltaUpdates.update(operation)` for everything in the write queue?
    -   **Critical Check:** `DeltaUpdates.insertNode` expects a specific payload structure. `DeltaUpdates.update` expects `{ deltas: [...] }`.
    -   If we unified `autoMount` to send deltas (which we did in `Manager.mjs`), then *everything* coming from `WorkerManager` is now a delta update!
    -   So `processQueue` can just call `DeltaUpdates.update(operation)`.

**Dependencies:**
-   This relies on the previous `Manager.mjs` refactoring where `autoMount` was transformed into `updateVdom` with `deltas`.

## Timeline

- 2025-12-16T20:14:01Z @tobiu added the `refactoring` label
- 2025-12-16T20:14:01Z @tobiu added the `architecture` label
- 2025-12-16T20:14:15Z @tobiu assigned to @tobiu
- 2025-12-16T20:15:06Z @tobiu added the `ai` label
- 2025-12-16T20:54:17Z @tobiu referenced in commit `4da6080` - "Main.mjs: Consolidate queues into Read/Write model #8131"
- 2025-12-16T20:54:26Z @tobiu closed this issue

