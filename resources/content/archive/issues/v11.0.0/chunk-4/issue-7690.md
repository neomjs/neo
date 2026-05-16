---
id: 7690
title: 'Enhancement: Clarify Memory Core healthcheck response for hybrid database strategy'
state: CLOSED
labels:
  - enhancement
  - developer-experience
  - ai
assignees:
  - tobiu
createdAt: '2025-11-02T16:15:59Z'
updatedAt: '2025-11-02T16:22:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7690'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-02T16:22:05Z'
---
# Enhancement: Clarify Memory Core healthcheck response for hybrid database strategy

The current `healthcheck` response from the Memory Core can be confusing for agents. It can report a `healthy` status even when the database process is not managed by the server (`"running": false`, `"managed": false`), because the server might be connected to a user-managed, externally running ChromaDB instance.

This leads agents to incorrectly assume the database is down and attempt to start it, causing confusion.

The `healthcheck` response should be enhanced to make this hybrid startup scenario clearer.

**Proposal:**

1.  Modify the `HealthCheckResponse` schema in `openapi.yaml`.
2.  Add a new field, perhaps `database.process.strategy` or similar, with possible values like `"managed"`, `"external"`, or `"unknown"`.
3.  Update `HealthService.mjs` to populate this new field based on whether the connection is to a managed process or an external one.
4.  Adjust the human-readable `details` array to explicitly state the connection type, e.g., "Connected to an externally managed ChromaDB instance."

This will provide a clearer picture to the agent, preventing incorrect assumptions and unnecessary actions.

## Timeline

- 2025-11-02T16:16:00Z @tobiu added the `enhancement` label
- 2025-11-02T16:16:00Z @tobiu added the `developer-experience` label
- 2025-11-02T16:16:00Z @tobiu added the `ai` label
- 2025-11-02T16:18:58Z @tobiu assigned to @tobiu
- 2025-11-02T16:22:01Z @tobiu referenced in commit `701fd04` - "Enhancement: Clarify Memory Core healthcheck response for hybrid database strategy #7690"
- 2025-11-02T16:22:05Z @tobiu closed this issue

