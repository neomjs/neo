---
id: 9121
title: 'DevIndex: Implement "Penalty Box" for Failed User Updates'
state: CLOSED
labels:
  - bug
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-12T20:48:50Z'
updatedAt: '2026-02-12T20:53:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9121'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-12T20:53:24Z'
---
# DevIndex: Implement "Penalty Box" for Failed User Updates

This task addresses a critical inefficiency in the DevIndex `Updater` service where "toxic" users (those who consistently trigger 502/504/403 errors) block the update queue.

**Problem:**
Currently, when a user update fails, the `Updater` logs the error but does **not** update the `lastUpdate` timestamp in `tracker.json`. This causes the Scheduler to prioritize these same failed users again in the very next run, creating an infinite loop of failures that wastes API quota (especially with the new hourly workflow).

**Solution ("The Penalty Box"):**
Modify `DevIndex.services.Updater` to update the `lastUpdate` timestamp to the current time even when an update **fails**.

**Logic:**
-   **On Success:** Update `lastUpdate` (Standard).
-   **On Failure:** Update `lastUpdate` (New).
-   **Outcome:** Failed users are pushed to the back of the priority queue. They will be retried only after the entire backlog (~3 days) is processed, preventing them from DOS-ing the hourly workflow.

**Impact:**
-   Unblocks the "Safe 200" hourly workflow.
-   Ensures 100% of the quota is spent on fresh, processable users.


## Timeline

- 2026-02-12T20:48:52Z @tobiu added the `bug` label
- 2026-02-12T20:48:52Z @tobiu added the `ai` label
- 2026-02-12T20:48:52Z @tobiu added the `performance` label
- 2026-02-12T20:50:07Z @tobiu assigned to @tobiu
- 2026-02-12T20:50:48Z @tobiu added parent issue #9106
- 2026-02-12T20:52:38Z @tobiu referenced in commit `e084582` - "fix: Implement Penalty Box for failed user updates (#9121)

- Failed updates now trigger a timestamp update in tracker.json
- Prevents toxic users from blocking the priority queue
- Counts failed attempts as processed to keep backlog accurate"
### @tobiu - 2026-02-12T20:52:50Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the "Penalty Box" logic in `Updater.mjs`.
> 
> **Change:**
> Inside the `processUser` catch block, I added:
> ```javascript
> indexUpdates.push({ login, lastUpdate: new Date().toISOString() });
> successCount++;
> ```
> 
> **Effect:**
> Any user that fails processing (after retries) will now have their `lastUpdate` timestamp set to *now*. This pushes them to the very end of the priority queue, ensuring the next hourly run picks up fresh, unblocked users. This effectively "unclogs" the pipeline.

- 2026-02-12T20:53:24Z @tobiu closed this issue
- 2026-02-12T20:55:14Z @tobiu cross-referenced by #9122

