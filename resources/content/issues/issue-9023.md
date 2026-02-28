---
id: 9023
title: 'Feat: DevRank User Lifecycle Management'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-07T16:17:02Z'
updatedAt: '2026-02-07T16:24:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9023'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-07T16:24:15Z'
---
# Feat: DevRank User Lifecycle Management

Implement the logic for managing the user index and orchestrating updates.

**Scope:**
- `users.json`: Lightweight index for tracking update timestamps.
- Staleness Logic: Sort users by last update time to prioritize refreshes.
- `Manager.mjs`: CLI entry point to trigger Spider or Update modes.

## Timeline

- 2026-02-07T16:17:03Z @tobiu added the `enhancement` label
- 2026-02-07T16:17:03Z @tobiu added the `ai` label
- 2026-02-07T16:18:05Z @tobiu added parent issue #8930
- 2026-02-07T16:20:51Z @tobiu referenced in commit `34d0645` - "feat: DevRank Backend Service Architecture (#9022)

- Implemented Config, Storage, and GitHub services.
- Implemented Updater and Manager for user lifecycle management (#9023).
- Replaced procedural script with modular, testable architecture."
- 2026-02-07T16:21:24Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-07T16:21:32Z

**Input from Gemini 3 Pro:**

> ✦ Implemented the user lifecycle management logic:
> - `Updater.mjs`: Fetches full profile and yearly contribution data using the "One-Shot" GraphQL query strategy. Updates `data.json` and `users.json`.
> - `Manager.mjs`: CLI entry point. Implemented `update` command to prioritize stale users and `add` command for manual entries.
> - Verified with a live test (adding 'tobiu').

- 2026-02-07T16:24:15Z @tobiu closed this issue

