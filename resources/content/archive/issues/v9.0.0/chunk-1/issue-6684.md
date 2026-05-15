---
id: 6684
title: 'data.RecordFactory: record.toJSON() => return a cloned data object'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-04-28T13:00:33Z'
updatedAt: '2025-04-28T13:01:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6684'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-04-28T13:01:13Z'
---
# data.RecordFactory: record.toJSON() => return a cloned data object

* Rationale: nested structures could cause side effects (passed by reference), in case devs would modify the passed return value directly

## Timeline

- 2025-04-28T13:00:33Z @tobiu added the `enhancement` label
- 2025-04-28T13:00:33Z @tobiu assigned to @tobiu
- 2025-04-28T13:01:07Z @tobiu referenced in commit `30dc1bd` - "data.RecordFactory: record.toJSON() => return a cloned data object #6684"
- 2025-04-28T13:01:13Z @tobiu closed this issue

