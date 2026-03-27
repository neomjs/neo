---
id: 9119
title: 'DevIndex: Add Scheduled Hourly Updater Workflow'
state: CLOSED
labels:
  - enhancement
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-02-12T20:31:17Z'
updatedAt: '2026-02-12T20:32:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9119'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-12T20:32:41Z'
---
# DevIndex: Add Scheduled Hourly Updater Workflow

This task implements a scheduled GitHub Actions workflow to keep the DevIndex data fresh.

**Objective:**
Run the `DevIndex.services.Updater` automatically on an hourly basis to update user profiles and contribution stats.

**Strategy:**
-   **Schedule:** Hourly (`cron: '0 * * * *'`).
-   **Batch Size:** Limit to **200 users** per run.
    -   *Rationale:* This stays safely within the 1,000 req/hour limit for public repositories, even accounting for 2-4x retry logic on errors.
    -   *Throughput:* ~4,800 updates/day -> ~3 day full refresh cycle for 15k users.
-   **Persistence:** The workflow will commit changes to `users.jsonl` and `tracker.json` back to the `dev` branch.

**Implementation:**
-   Create `.github/workflows/devindex-updater.yml`
-   Use `stefanzweifel/git-auto-commit-action` for reliable committing.
-   Use `concurrency` to prevent overlapping runs.


## Timeline

- 2026-02-12T20:31:18Z @tobiu added the `enhancement` label
- 2026-02-12T20:31:18Z @tobiu added the `ai` label
- 2026-02-12T20:31:18Z @tobiu added the `build` label
- 2026-02-12T20:31:35Z @tobiu assigned to @tobiu
- 2026-02-12T20:31:48Z @tobiu added parent issue #9106
- 2026-02-12T20:32:06Z @tobiu referenced in commit `9578cf8` - "feat: Add hourly DevIndex updater workflow (#9119)

- Runs hourly with a limit of 200 users to stay within GitHub API rate limits
- Commits changes to users.jsonl and tracker.json back to the repository"
### @tobiu - 2026-02-12T20:32:16Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the scheduled workflow in `.github/workflows/devindex-updater.yml`.
> 
> **Configuration:**
> -   **Schedule:** Hourly (`0 * * * *`).
> -   **Command:** `npm run devindex:update -- --limit=200`
> -   **Safety:** `concurrency` group ensures only one update runs at a time.
> -   **Persistence:** Uses `git-auto-commit-action` to push changes to `users.jsonl` and `tracker.json` back to the `dev` branch.
> 
> This setup should robustly handle the "Safe 200" batch size, maintaining index freshness without risking rate limits.

- 2026-02-12T20:32:42Z @tobiu closed this issue

