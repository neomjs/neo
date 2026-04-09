---
id: 9813
title: Refactor Knowledge Base Ingestion to Target Active Swarm State
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-09T09:22:51Z'
updatedAt: '2026-04-09T09:25:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9813'
author: tobiu
commentsCount: 1
parentIssue: 9811
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-09T09:25:51Z'
---
# Refactor Knowledge Base Ingestion to Target Active Swarm State

# Strategic Context
The `knowledge-base` server's semantic search `type: 'ticket'` is returning 0 results because it is pointing to a legacy, deprecated directory (`.github/ISSUE_ARCHIVE`). This blinds LLM agents from actively querying ongoing architectural discussions and sub-tasks.

# Architectural Reality
1. `ai/mcp/server/knowledge-base/source/TicketSource.mjs`: Must be repointed to `resources/content/issues` and `resources/content/issue-archive`.
2. `ai/mcp/server/knowledge-base/source/DiscussionSource.mjs`: Needs to be created to target `resources/content/discussions` and ingested via `DatabaseService.mjs` ETL pipeline.

## Timeline

- 2026-04-09T09:22:52Z @tobiu added the `enhancement` label
- 2026-04-09T09:22:52Z @tobiu added the `ai` label
- 2026-04-09T09:22:52Z @tobiu added the `architecture` label
- 2026-04-09T09:23:18Z @tobiu added parent issue #9811
- 2026-04-09T09:25:32Z @tobiu referenced in commit `0998327` - "feat: Refactor Knowledge Base Ingestion to Target Active Swarm State (#9813)"
- 2026-04-09T09:25:38Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-09T09:25:50Z

Successfully implemented the DiscussionSource.mjs logic and refactored TicketSource.mjs to ingest the active `resources/content` state instead of the deprecated ISSUE_ARCHIVE. Native semantic search is now fully restored.

- 2026-04-09T09:25:51Z @tobiu closed this issue
- 2026-04-09T09:26:05Z @tobiu cross-referenced by #9811

