---
id: 7530
title: Add Database Management Tools to Knowledge Base Server
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-17T12:46:44Z'
updatedAt: '2025-10-17T12:54:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7530'
author: tobiu
commentsCount: 0
parentIssue: 7529
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-17T12:54:26Z'
---
# Add Database Management Tools to Knowledge Base Server

To give agents more control over their environment, we will add tools to the Knowledge Base server to start and stop its underlying ChromaDB instance.

## Acceptance Criteria

1.  A `start_database` tool is added to the `knowledge-base` server's `openapi.yaml`.
2.  The tool's service handler executes `chroma run --path ./chroma` as a background process.
3.  A `stop_database` tool is added, which can terminate the process started by `start_database`.
4.  The `healthcheck` tool is updated to include the running status of the database process.
5.  The new tools are implemented in a new `databaseLifecycleService.mjs`.

## Timeline

- 2025-10-17T12:46:44Z @tobiu assigned to @tobiu
- 2025-10-17T12:46:45Z @tobiu added the `enhancement` label
- 2025-10-17T12:46:45Z @tobiu added parent issue #7529
- 2025-10-17T12:46:46Z @tobiu added the `ai` label
- 2025-10-17T12:54:12Z @tobiu referenced in commit `74a1c7e` - "Add Database Management Tools to Knowledge Base Server #7530"
- 2025-10-17T12:54:26Z @tobiu closed this issue

