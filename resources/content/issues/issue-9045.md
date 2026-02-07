---
id: 9045
title: 'Feat: DevRank Active Pruning & Auto-Cleanup'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-02-07T22:04:33Z'
updatedAt: '2026-02-07T22:04:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9045'
author: tobiu
commentsCount: 0
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: DevRank Active Pruning & Auto-Cleanup

Optimize the DevRank data lifecycle by actively pruning low-value users and enforcing hygiene before operations.

**Problem:**
1.  **Tracker Bloat:** `Updater.mjs` currently keeps low-value users in `tracker.json` (updating their timestamp). This causes the index to grow indefinitely with users who have already been rejected.
2.  **Stale State:** `Manager.mjs` runs `update` or `spider` operations potentially on "dirty" data (e.g., users that should have been pruned), leading to wasted processing.

**Solution:**
1.  **Pre-Run Cleanup:** Modify `Manager.mjs` to automatically run `Cleanup.run()` before executing `spider` or `update` commands.
2.  **Active Pruning:** Modify `Updater.mjs` to **remove** users from `tracker.json` immediately if they fail the contribution threshold, rather than just updating their timestamp.
3.  **Storage Support:** Enhance `Storage.mjs` to support key removal in `updateTracker` (e.g., by accepting `null` or a specific removal flag).

**Benefits:**
- `tracker.json` stays small and focused on high-value + pending users.
- `update` runs never waste API calls on known low-value users (because they are pruned *before* the run or *during* the previous run).
- No need for a massive "Visited Users" database.

**Tasks:**
- [ ] Refactor `Storage.mjs` to handle deletions in `updateTracker`.
- [ ] Refactor `Updater.mjs` to request deletion for low-value users.
- [ ] Refactor `Manager.mjs` to inject `Cleanup.run()`.

## Timeline

- 2026-02-07T22:04:34Z @tobiu added the `enhancement` label
- 2026-02-07T22:04:34Z @tobiu added the `ai` label
- 2026-02-07T22:04:46Z @tobiu added parent issue #8930

