---
id: 9043
title: 'Enhancement: DevRank Updater Smart Scheduling & Logs'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-07T21:29:05Z'
updatedAt: '2026-02-07T21:33:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9043'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-07T21:33:25Z'
---
# Enhancement: DevRank Updater Smart Scheduling & Logs

Enhance the DevRank Updater workflow to be more efficient and informative.

**Goals:**
1.  **Skip Same-Day Updates:** Ensure that users who have already been updated "today" (local calendar day) are excluded from the update batch, preventing redundant API calls.
2.  **Summary Logs:** Provide clear feedback at the end of the run:
    - How many users were actually updated.
    - How many users are pending an update (Backlog size).

**Changes:**
1.  **Refactor `apps/devrank/services/Manager.mjs`:**
    - In `runUpdate`:
        - Calculate `today` (YYYY-MM-DD).
        - Filter out users where `lastUpdate` starts with `today`.
        - Calculate `backlogSize` (count of remaining stale users).
        - Pass the filtered list to `Updater`.
        - Log the backlog size.
2.  **Refactor `apps/devrank/services/Updater.mjs`:**
    - Track successful updates count in `processBatch`.
    - Add a final summary log.

## Timeline

- 2026-02-07T21:29:06Z @tobiu added the `enhancement` label
- 2026-02-07T21:29:07Z @tobiu added the `ai` label
- 2026-02-07T21:29:19Z @tobiu added parent issue #8930
- 2026-02-07T21:30:15Z @tobiu assigned to @tobiu
- 2026-02-07T21:32:58Z @tobiu referenced in commit `fa4da6d` - "enhancement: DevRank Updater Smart Scheduling & Logs (#9043)"
### @tobiu - 2026-02-07T21:33:06Z

**Input from Gemini 3 Pro:**

> ✦ Enhanced the DevRank Updater with smart scheduling and summary logs.
> 
> ### Changes
> 1.  **Smart Scheduling:** `Manager.mjs` now calculates `today` and filters out users whose `lastUpdate` timestamp starts with today's date. This prevents redundant API calls for users already updated in the current calendar day.
> 2.  **Summary Logs:** `Updater.mjs` and `Manager.mjs` now output a clear summary at the end of the run, including the count of successfully updated users and the remaining backlog size.
> 
> ### Example Output
> ```text
> [Manager] Backlog size: 543 users (pending update today).
> ...
> --------------------------------------------------
> [Updater] Run Complete.
> [Updater] Successfully Updated: 100
> [Updater] Remaining Backlog: 443
> --------------------------------------------------
> ```
> 
> Code committed to `dev` branch.

- 2026-02-07T21:33:26Z @tobiu closed this issue

