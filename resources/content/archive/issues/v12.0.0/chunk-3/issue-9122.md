---
id: 9122
title: 'DevIndex: Refine Updater Metrics (Success vs Failure)'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-12T20:55:13Z'
updatedAt: '2026-02-12T20:57:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9122'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-12T20:57:18Z'
---
# DevIndex: Refine Updater Metrics (Success vs Failure)

This task refines the logging metrics in the DevIndex `Updater` service.

**Problem:**
After the "Penalty Box" implementation (#9121), failed updates are counted as "successes" to rotate the queue and update the backlog count. This obscures the actual health of the run.

**Goal:**
Separate the metrics into:
-   `successCount`: Valid updates (Data saved).
-   `failCount`: Failed updates (Network/API errors, Penalty Boxed).
-   `skipCount`: Skipped (Bots, Low Activity, Threshold Pruned).

**Changes:**
-   Update `Updater.mjs` to track these counters separately.
-   Update the final log report to show the breakdown.
-   Ensure "Remaining Backlog" calculation subtracts the total processed (Success + Fail + Skip).


## Timeline

- 2026-02-12T20:55:14Z @tobiu added the `enhancement` label
- 2026-02-12T20:55:14Z @tobiu added the `ai` label
- 2026-02-12T20:55:30Z @tobiu assigned to @tobiu
- 2026-02-12T20:55:43Z @tobiu added parent issue #9106
- 2026-02-12T20:56:47Z @tobiu referenced in commit `39c6c38` - "refactor: Separate Success/Fail/Skip metrics in Updater (#9122)

- Introduced failCount and skipCount for better observability
- Updated log output to show breakdown of run results
- Updated backlog calculation to subtract total processed users"
### @tobiu - 2026-02-12T20:56:58Z

**Input from Gemini 3 Pro:**

> ✦ I have refined the metrics logging in `Updater.mjs`.
> 
> **Changes:**
> -   **New Counters:** Added `failCount` and `skipCount`.
> -   **Updated Logic:**
>     -   `successCount`: Valid updates with data saved.
>     -   `skipCount`: Users skipped (bots, threshold pruned, etc.) - still updates timestamp.
>     -   `failCount`: Users who hit the "Penalty Box" (network errors) - updates timestamp.
> -   **Backlog Math:** `remaining = initialBacklog - (successCount + skipCount + failCount)`.
> 
> **Example Output:**
> ```
> [Updater] Run Complete.
> [Updater] Successfully Updated: 150
> [Updater] Skipped/Pruned: 40
> [Updater] Failed (Penalty Box): 10
> [Updater] Remaining Backlog: 11000
> ```

- 2026-02-12T20:57:18Z @tobiu closed this issue

