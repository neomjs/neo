---
id: 9136
title: Implement 30-Day Retention Policy for DevIndex Penalty Box
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-13T02:22:40Z'
updatedAt: '2026-02-13T12:58:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9136'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-13T12:58:50Z'
---
# Implement 30-Day Retention Policy for DevIndex Penalty Box

We need a mechanism to handle user deletions and long-term suspensions in compliance with privacy expectations ("Right to be Forgotten"). Currently, users who return 404s are moved to the Penalty Box (`failed.json`) indefinitely if they have prior history.

**The Solution: Penalty Box Retention Policy (TTL)**

1.  **Schema Migration:** Convert `apps/devindex/resources/failed.json` from a simple Array `["login"]` to a Map `{"login": "2026-02-13T..."}` to track *when* the failure first occurred.
2.  **Cleanup Logic:** Update `Cleanup.mjs` to check this timestamp.
3.  **Policy:** If a user remains in the Penalty Box for **30 Days**:
    -   Assume the account is permanently deleted or banned.
    -   **Hard Delete:** Remove from `users.jsonl`, `tracker.json`, and `failed.json`.
    -   Log the deletion.

This ensures that our index eventually reflects reality and respects user deletion.

## Timeline

- 2026-02-13T02:22:41Z @tobiu added the `enhancement` label
- 2026-02-13T02:22:41Z @tobiu added the `ai` label
- 2026-02-13T02:23:05Z @tobiu added parent issue #9106
- 2026-02-13T02:23:08Z @tobiu assigned to @tobiu
- 2026-02-13T12:58:15Z @tobiu referenced in commit `27e945d` - "feat: Implement 30-Day Retention Policy for DevIndex Penalty Box (#9136)

- Migrate failed.json from Array to Map (login -> timestamp)
- Update Cleanup service to prune users who have been in the penalty box for >30 days
- Ensure failed.json is persisted on every cleanup run to lock in timestamps
- Explicitly prune expired users from the rich data index (users.jsonl)"
### @tobiu - 2026-02-13T12:58:26Z

**Input from Gemini 3 Pro:**

> ✦ Implemented the 30-day retention policy for the Penalty Box (`failed.json`).
> 
> **Changes:**
> 1.  **Schema Migration:** `Storage.getFailed()` now lazily migrates `failed.json` from a legacy `Array` to a `Map<String, Timestamp>`.
> 2.  **Retention Logic:** `Cleanup.mjs` now checks the timestamp of failed users. If a user has been in the penalty box for more than 30 days, they are:
>     -   Removed from `failed.json`.
>     -   Pruned from `users.jsonl` (Rich Data).
>     -   Pruned from `tracker.json` (via Orphan logic).
> 3.  **Persistence:** `Cleanup.mjs` now forces a save of `failed.json` on every run. This ensures that the migration (setting the "start time" for existing failed users) is persisted immediately, and that the file remains sorted.
> 
> The "clock" for existing failed users starts now (upon the first Cleanup run). New failures will use the time of failure.

- 2026-02-13T12:58:50Z @tobiu closed this issue

