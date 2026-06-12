---
id: 9125
title: 'DevIndex: Stop Cleanup.mjs from pruning orphaned tracker users'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-12T22:08:13Z'
updatedAt: '2026-02-12T22:26:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9125'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-12T22:26:32Z'
---
# DevIndex: Stop Cleanup.mjs from pruning orphaned tracker users

The `Cleanup.mjs` service currently deletes users from `tracker.json` if they have a `lastUpdate` timestamp but are missing from `users.json`.
This logic was intended to prune "low value" users.
However, with the new "Penalty Box" feature (#9121), users who fail to update (e.g. 502/504) *also* get a `lastUpdate` timestamp but are not added to `users.json`.
Result: `Cleanup.mjs` deletes these failed users, causing them to be lost from the queue. When rediscovered by the spider, they are treated as "new" and re-scanned immediately, wasting API quota.

**Solution:**
- Stop pruning orphaned users from `tracker.json`.
- Keep them in the tracker to ensure they are processed according to their `lastUpdate` timestamp (i.e., at the back of the queue).
- Add logging to identify these orphaned users for debugging.

## Timeline

- 2026-02-12T22:08:14Z @tobiu added the `bug` label
- 2026-02-12T22:08:14Z @tobiu added the `ai` label
- 2026-02-12T22:24:48Z @tobiu referenced in commit `8bd44bd` - "feat: Implement 'Penalty Box' via sidecar file for failed updates (#9125)

- Added failed.json to track users who fail update processing
- Updated Updater.mjs to add/remove users from failed list
- Updated Cleanup.mjs to protect failed users from being pruned
- Updated Storage.mjs with helper methods for failed list management
- Manually populated failed.json with currently orphaned users to prevent data loss"
### @tobiu - 2026-02-12T22:25:00Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the "Penalty Box" logic using a sidecar file (`failed.json`) instead of bloating the tracker.
> 
> **Changes:**
> 1.  **Storage:** Added `failed.json` (defaults to `[]`) and methods `getFailed()` / `updateFailed()`.
> 2.  **Updater:**
>     -   When a user update fails, they are added to `failed.json`.
>     -   When a user update succeeds, they are removed from `failed.json`.
>     -   Users are still pushed to the back of the `tracker` queue (timestamp updated).
> 3.  **Cleanup:**
>     -   Re-enabled "Active Pruning" for orphaned users (those in `tracker` but not in `users`).
>     -   **Crucially**, added a check: if an orphan is in `failed.json`, they are **KEPT** in the tracker (protected).
>     -   Logs explicit warnings when keeping a failed user or pruning a non-failed orphan.
> 4.  **Data Recovery:** I manually identified the 27 users who were about to be pruned in the previous run and added them to `failed.json` to ensure they are not lost.
> 
> This approach keeps `tracker.json` lean while ensuring robust retry logic for problematic users.

- 2026-02-12T22:25:28Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-12T22:26:10Z

**Input from Gemini 3 Pro:**

> ✦ I am closing this issue as I have implemented the fix and pushed the changes.
> I have also verified the fix by running the cleanup script with the manually populated `failed.json` list, confirming that the users are now correctly identified and kept in the tracker.

- 2026-02-12T22:26:33Z @tobiu closed this issue

