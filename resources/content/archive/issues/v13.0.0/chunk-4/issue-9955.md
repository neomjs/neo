---
id: 9955
title: DreamService / Librarian Coupling
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2026-04-13T09:28:51Z'
updatedAt: '2026-06-05T17:31:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9955'
author: tobiu
commentsCount: 1
parentIssue: 9954
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-06-05T17:31:46Z'
---
# DreamService / Librarian Coupling

### Goal
Filter the natively-extracted SQLite Capability Gaps dynamically into a local execution queue instead of mapping to GitHub text issues.

### Implementation Checklist
- [ ] Implement an autonomous query map inside `DreamService` targeting `SELECT * FROM nodes WHERE properties.capabilityGap IS NOT NULL`.
- [ ] Define the native queue structure that cleanly buffers the extracted gaps for delegation consumption, ensuring gaps are only parsed once to avoid duplicate sub-agent execution attempts.

## Timeline

- 2026-04-13T09:28:52Z @tobiu added the `enhancement` label
- 2026-04-13T09:28:53Z @tobiu added the `ai` label
- 2026-04-13T09:28:53Z @tobiu added the `architecture` label
- 2026-04-13T09:29:02Z @tobiu added parent issue #9954
- 2026-06-05T17:12:18Z @neo-opus-ada cross-referenced by #9954
### @neo-opus-ada - 2026-06-05T17:31:45Z

Closed not-planned with parent epic #9954 (operator-directed; premise superseded by the GitHub-issue-SSOT Dream Pipeline + epic-* skill suite).

- 2026-06-05T17:31:46Z @neo-opus-ada closed this issue

