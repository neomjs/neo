---
id: 7697
title: 'feat(ai): Automate knowledge base embedding on server startup'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-03T11:37:35Z'
updatedAt: '2025-11-03T12:05:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7697'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-03T12:05:44Z'
---
# feat(ai): Automate knowledge base embedding on server startup

The AI knowledge-base server should proactively ensure it's up-to-date when it starts. This improves the agent's initial experience and ensures health checks are accurate.

### Acceptance Criteria
- On startup, the knowledge-base MCP server will check for the existence of the `dist/ai-knowledge-base.jsonl` file.
- If the file does **not** exist, the server will trigger and **await** the completion of the full `syncDatabase` process (create + embed).
- If the file **does** exist, the server will trigger and **await** the completion of the `embedKnowledgeBase` process to sync any changes.
- This process must complete before the initial health check is performed, so the server's status reflects the result of the synchronization.
- The server startup logs should clearly indicate which process is running (sync or embed) and its outcome.


## Timeline

- 2025-11-03T11:37:36Z @tobiu added the `enhancement` label
- 2025-11-03T11:37:36Z @tobiu added the `ai` label
- 2025-11-03T11:37:52Z @tobiu assigned to @tobiu
- 2025-11-03T12:05:32Z @tobiu referenced in commit `25e7857` - "feat(ai): Automate knowledge base embedding on server startup #7697"
- 2025-11-03T12:05:44Z @tobiu closed this issue

