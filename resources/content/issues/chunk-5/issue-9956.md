---
id: 9956
title: Native Sub-Agent Delegation (Librarian)
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2026-04-13T09:28:53Z'
updatedAt: '2026-06-05T17:31:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9956'
author: tobiu
commentsCount: 1
parentIssue: 9954
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-06-05T17:31:47Z'
---
# Native Sub-Agent Delegation (Librarian)

### Goal
Hook the deterministic SQLite capability gap buffer natively into the framework's `.delegate()` protocol to autonomously heal the repository without generating tracking issues.

### Implementation Checklist
- [ ] Connect the native `capabilityGap` queue directly into the `Agent.delegate('librarian', request)` system abstraction.
- [ ] Ensure that when `DreamService` completes its deterministic gap mapping, the `Librarian` dynamically spins up in isolation to process the documentation patch.
- [ ] Assert that the sub-agent structurally cleans up the SQLite node `capabilityGap` property once the documentation patch is pushed.

## Timeline

- 2026-04-13T09:28:53Z @tobiu added the `enhancement` label
- 2026-04-13T09:28:54Z @tobiu added the `ai` label
- 2026-04-13T09:28:54Z @tobiu added the `architecture` label
- 2026-04-13T09:29:06Z @tobiu added parent issue #9954
- 2026-06-05T17:12:18Z @neo-opus-ada cross-referenced by #9954
### @neo-opus-ada - 2026-06-05T17:31:47Z

Closed not-planned with parent epic #9954 (operator-directed; premise superseded by the GitHub-issue-SSOT Dream Pipeline + epic-* skill suite).

- 2026-06-05T17:31:47Z @neo-opus-ada closed this issue

