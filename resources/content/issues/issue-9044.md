---
id: 9044
title: 'Fix: DevRank Updater Infinite Loop & Tracker Pruning'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-07T21:42:54Z'
updatedAt: '2026-02-07T21:46:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9044'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-07T21:46:37Z'
---
# Fix: DevRank Updater Infinite Loop & Tracker Pruning

Fix two critical issues in the DevRank update cycle:

1.  **Infinite Loop for Bots:** The Updater currently skips adding `indexUpdates` for users that return `null` (bots/deleted). This leaves their `lastUpdate` as `null` in the tracker, causing `Manager.runUpdate` to re-select them immediately in the next run.
    *   **Fix:** In `Updater.mjs`, ensure `indexUpdates` is pushed even if `fetchUserData` returns null (set timestamp to now, or remove from tracker/add to blacklist).

2.  **Tracker Pruning:** The `Cleanup.mjs` service currently does **not** prune low-value users from `tracker.json`, only from `users.json`. This means we keep tracking thousands of inactive users forever.
    *   **Fix:** In `Cleanup.mjs`, remove users from `tracker.json` if they do not meet the contribution threshold (and are not whitelisted).

**Plan:**
1.  **Refactor `Updater.mjs`:** Ensure `indexUpdates` is populated for "SKIPPED (No Data/Bot)" cases.
2.  **Refactor `Cleanup.mjs`:** Update the tracker filtering logic to respect the contribution threshold, effectively pruning the index.
3.  **Refactor `Storage.mjs`:** Ensure case-insensitivity for logins to prevent duplicates.

## Timeline

- 2026-02-07T21:42:55Z @tobiu added the `bug` label
- 2026-02-07T21:42:55Z @tobiu added the `ai` label
- 2026-02-07T21:43:37Z @tobiu added parent issue #8930
- 2026-02-07T21:44:09Z @tobiu assigned to @tobiu
- 2026-02-07T21:45:56Z @tobiu referenced in commit `9f95633` - "fix: DevRank Updater Infinite Loop & Tracker Pruning (#9044)"
### @tobiu - 2026-02-07T21:46:17Z

**Input from Gemini 3 Pro:**

> ✦ Fixed critical issues in the DevRank update cycle.
> 
> ### Fixes
> 1.  **Infinite Loop for Bots:** `Updater.mjs` now updates the `tracker.json` with the current timestamp even for users who return `null` (bots, deleted, or errors). This ensures they are not immediately re-selected by the scheduler in the next run.
> 2.  **Tracker Pruning:** `Cleanup.mjs` now filters the `tracker.json` to remove users who have been updated but did not meet the contribution threshold (and are not whitelisted). This effectively prunes low-value users from the index, preventing the tracking file from growing indefinitely with inactive accounts.
> 3.  **Case Sensitivity:** `Storage.mjs` now normalizes login keys to lowercase before updating the tracker map, preventing duplicate entries for users with different casing in different contexts.
> 
> Code committed to `dev` branch.

- 2026-02-07T21:46:37Z @tobiu closed this issue

