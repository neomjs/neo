---
id: 9136
title: Implement 30-Day Retention Policy for DevIndex Penalty Box
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-13T02:22:40Z'
updatedAt: '2026-02-13T02:23:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9136'
author: tobiu
commentsCount: 0
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

