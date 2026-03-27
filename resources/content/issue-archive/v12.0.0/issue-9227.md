---
id: 9227
title: Unify DevIndex Workflows and implement Spider backpressure
state: CLOSED
labels:
  - enhancement
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-02-21T14:32:31Z'
updatedAt: '2026-02-21T14:36:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9227'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-21T14:34:43Z'
---
# Unify DevIndex Workflows and implement Spider backpressure

The DevIndex currently uses two independent GitHub Action workflows (`devindex-spider.yml` and `devindex-updater.yml`) that run on competing 30-minute cron schedules. This leads to intermittent Git merge conflicts when both jobs attempt to modify and push `tracker.json` simultaneously. Furthermore, uncontrolled Spider discovery can bloat the tracker backlog.

**Tasks:**
1.  **Unify Workflows:** Combine the Spider and Updater into a single, sequential pipeline (`.github/workflows/devindex-pipeline.yml`) that runs hourly. This guarantees atomic commits and zero git conflicts.
2.  **Backpressure Valve:** Enhance the Spider to check the number of "pending" users (`lastUpdate: null`) in `tracker.json`. If the backlog exceeds `config.spider.maxPendingUsers` (e.g., 2000), the Spider should abort its discovery run to let the Updater catch up.
3.  **Restore 3x Loop:** With the workflows unified and backpressure in place, the Spider can safely be restored to execute 3 discovery loops per hour instead of 1.
4.  **Cleanup:** Remove the obsolete individual workflows.

## Timeline

- 2026-02-21T14:32:32Z @tobiu added the `epic` label
- 2026-02-21T14:32:32Z @tobiu added the `ai` label
- 2026-02-21T14:32:33Z @tobiu added the `build` label
- 2026-02-21T14:33:57Z @tobiu referenced in commit `d106ed9` - "build(devindex): Unify GH Actions into single pipeline and add Spider backpressure (#9227)"
- 2026-02-21T14:34:07Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-21T14:34:23Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the Unified Pipeline and Spider Backpressure as requested.
> 
> - Created `.github/workflows/devindex-pipeline.yml` to replace the two independent cron jobs, orchestrating the 3x Spider Loop followed immediately by the Updater within a single, sequential job.
> - Removed `devindex-spider.yml` and `devindex-updater.yml` to eliminate Git merge conflicts and double-running.
> - Modified `apps/devindex/services/config.mjs` to add `maxPendingUsers: 2000` to the `spider` configuration.
> - Modified `apps/devindex/services/Spider.mjs` `run()` method to check the number of users with `lastUpdate: null`. If this backlog equals or exceeds the `maxPendingUsers` cap, the Spider now immediately aborts its run, forcing it to sleep and letting the Updater consume the existing queue.
> 
> These changes have been committed, rebased over the latest remote background updates, and pushed to `dev`. Closing issue.

- 2026-02-21T14:34:43Z @tobiu closed this issue
- 2026-02-21T14:36:02Z @tobiu removed the `epic` label
- 2026-02-21T14:36:02Z @tobiu added the `enhancement` label

