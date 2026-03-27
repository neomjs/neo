---
id: 9030
title: 'Refactor: DevRank Data Naming Convention & Whitelist'
state: CLOSED
labels:
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-07T18:20:45Z'
updatedAt: '2026-02-07T18:27:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9030'
author: tobiu
commentsCount: 0
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-07T18:27:04Z'
---
# Refactor: DevRank Data Naming Convention & Whitelist

Rename data files to be more semantic and introduce a whitelist policy.

**Renaming:**
- `data.json` -> `users.json` (The primary dataset).
- `users.json` -> `tracker.json` (The backend discovery index).

**New Feature:**
- `whitelist.json`: List of users to include in `users.json` even if they are below the `minTotalContributions` threshold.

## Timeline

- 2026-02-07T18:20:46Z @tobiu added the `refactoring` label
- 2026-02-07T18:20:58Z @tobiu added parent issue #8930
- 2026-02-07T18:21:16Z @tobiu assigned to @tobiu
- 2026-02-07T18:26:52Z @tobiu referenced in commit `febce15` - "refactor: DevRank Data Naming Convention & Whitelist (#9030)

- Renamed data.json -> users.json (Rich Data).
- Renamed users.json -> tracker.json (Backend Index).
- Updated Storage, Config, Updater, Manager, and Spider to use semantic naming.
- Implemented Whitelist support in Updater.
- Initialized empty whitelist.json."
- 2026-02-07T18:27:04Z @tobiu closed this issue

