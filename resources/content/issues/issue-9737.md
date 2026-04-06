---
id: 9737
title: Implement Topological Ingestion for Memories & Summaries in Edge Graph
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-06T16:53:55Z'
updatedAt: '2026-04-06T17:06:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9737'
author: tobiu
commentsCount: 1
parentIssue: 9736
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-06T17:06:31Z'
---
# Implement Topological Ingestion for Memories & Summaries in Edge Graph

**Goal:** Map transient vector memories as structural nodes.

**Acceptance Criteria:**
1. Update `MemoryService.addMemory` to natively call `GraphService.upsertNode` for `AGENT_MEMORY` nodes, linking them to the active context frontier.
2. Update `SessionService.summarizeSession` to create sequential `SESSION_SUMMARY` nodes, parsing output to semantically link them to discussed `ISSUE` IDs.

## Timeline

- 2026-04-06T16:53:56Z @tobiu added the `enhancement` label
- 2026-04-06T16:53:56Z @tobiu added the `ai` label
- 2026-04-06T16:54:24Z @tobiu assigned to @tobiu
- 2026-04-06T16:54:27Z @tobiu added parent issue #9736
- 2026-04-06T17:03:55Z @tobiu referenced in commit `4baf471` - "feat: Implement Hebbian Memory Integration via topological graph ingestion

This commit covers Issue #9737 and #9738 by injecting AGENT_MEMORY and SESSION_SUMMARY nodes natively into the SQLite Edge Graph, and establishing passive Antigravity local directory ingestion."
### @tobiu - 2026-04-06T17:06:30Z

Topological graph ingestion and session summary logic completed in commit 4baf47106. Memory core now natively upgrades the edge graph matrix.

- 2026-04-06T17:06:32Z @tobiu closed this issue

