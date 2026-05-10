---
id: 9738
title: Implement Passive Artifact Ingestion from Antigravity Brain
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-06T16:54:02Z'
updatedAt: '2026-04-06T17:06:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9738'
author: tobiu
commentsCount: 1
parentIssue: 9736
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-06T17:06:37Z'
---
# Implement Passive Artifact Ingestion from Antigravity Brain

**Goal:** Allow the Memory Core to consume highly-structured agent metadata.

**Acceptance Criteria:**
1. Update `SessionService` to actively scan the local `~/.gemini/antigravity/brain/` directories during summarization routines.
2. Match active session timestamps to find and ingest `implementation_plan.md` files (or other artifacts).
3. Plumb the parsed artifact into ChromaDB and map it structurally as an `IMPLEMENTATION_PLAN` node connected to the parent `SESSION_SUMMARY`.

## Timeline

- 2026-04-06T16:54:03Z @tobiu added the `enhancement` label
- 2026-04-06T16:54:03Z @tobiu added the `ai` label
- 2026-04-06T16:54:26Z @tobiu assigned to @tobiu
- 2026-04-06T16:54:28Z @tobiu added parent issue #9736
- 2026-04-06T17:03:55Z @tobiu referenced in commit `4baf471` - "feat: Implement Hebbian Memory Integration via topological graph ingestion

This commit covers Issue #9737 and #9738 by injecting AGENT_MEMORY and SESSION_SUMMARY nodes natively into the SQLite Edge Graph, and establishing passive Antigravity local directory ingestion."
### @tobiu - 2026-04-06T17:06:36Z

Antigravity parsing and ingestion implementation plan pipeline built and connected in commit 4baf47106. The timeline matching buffer is set to 12 hours.

- 2026-04-06T17:06:37Z @tobiu closed this issue

