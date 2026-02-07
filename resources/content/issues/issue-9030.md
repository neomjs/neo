---
id: 9030
title: 'Refactor: DevRank Data Naming Convention & Whitelist'
state: OPEN
labels:
  - refactoring
assignees: []
createdAt: '2026-02-07T18:20:45Z'
updatedAt: '2026-02-07T18:20:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9030'
author: tobiu
commentsCount: 0
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

