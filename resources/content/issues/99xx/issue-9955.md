---
id: 9955
title: DreamService / Librarian Coupling
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2026-04-13T09:28:51Z'
updatedAt: '2026-04-13T09:28:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9955'
author: tobiu
commentsCount: 0
parentIssue: 9954
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

