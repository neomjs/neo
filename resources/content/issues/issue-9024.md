---
id: 9024
title: 'Refactor: Optimize DevRank User Index Storage'
state: CLOSED
labels:
  - enhancement
  - performance
assignees:
  - tobiu
createdAt: '2026-02-07T16:31:34Z'
updatedAt: '2026-02-07T16:33:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9024'
author: tobiu
commentsCount: 0
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-07T16:33:32Z'
---
# Refactor: Optimize DevRank User Index Storage

Refactor `apps/devrank/resources/users.json` to use a Key-Value Object format (`{ "username": "timestamp" }`) instead of an Array of Objects.

**Goal:**
- Reduce file size overhead by removing repetitive keys (`login`, `lastUpdate`) in preparation for 100k+ records.
- Implement auto-migration for the existing file.
- Update `Storage.mjs` to handle the transformation transparently.

## Timeline

- 2026-02-07T16:31:35Z @tobiu added the `enhancement` label
- 2026-02-07T16:31:35Z @tobiu added the `performance` label
- 2026-02-07T16:31:47Z @tobiu added parent issue #8930
- 2026-02-07T16:32:33Z @tobiu assigned to @tobiu
- 2026-02-07T16:33:20Z @tobiu referenced in commit `62a62ac` - "refactor: Optimize DevRank User Index Storage (#9024)

- Converted users.json from Array to Key-Value Object for efficiency.
- Updated Storage.mjs with auto-migration logic.
- Verified migration via CLI."
- 2026-02-07T16:33:32Z @tobiu closed this issue

