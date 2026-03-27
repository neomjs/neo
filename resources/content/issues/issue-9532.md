---
id: 9532
title: Support SSE transport for knowledge-base and memory-core MCP servers
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-03-23T15:50:31Z'
updatedAt: '2026-03-23T16:01:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9532'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-23T16:01:02Z'
---
# Support SSE transport for knowledge-base and memory-core MCP servers

### Description
To support cloud deployments (e.g., via Docker) of our MCP servers (specifically `knowledge-base` and `memory-core`), we need to add support for the Server-Sent Events (SSE) transport protocol.

Currently, these servers strictly use the `StdioServerTransport` which is suitable for local processes but cannot be used when exposing the server via a network endpoint.

### Tasks
- Add `transport`, `ssePort`, and `authMiddleware` to the default configurations in `ai/mcp/server/knowledge-base/config.mjs` and `ai/mcp/server/memory-core/config.mjs`.
- Update `initAsync` in `ai/mcp/server/knowledge-base/Server.mjs` to dynamically load `express` and `SSEServerTransport` if the configured transport is `sse`.
- Update `initAsync` in `ai/mcp/server/memory-core/Server.mjs` with the same logic.

This will allow users to deploy these services as cloud-native microservices while avoiding the need to add `express` as a dependency for local Neo.mjs environments.

## Timeline

- 2026-03-23T15:50:31Z @tobiu assigned to @tobiu
- 2026-03-23T15:50:33Z @tobiu added the `enhancement` label
- 2026-03-23T15:50:33Z @tobiu added the `ai` label
- 2026-03-23T16:00:25Z @tobiu referenced in commit `9075146` - "feat: Add SSE transport for MCP servers (#9532)

Adds support for the Server-Sent Events (SSE) transport protocol to the
knowledge-base and memory-core MCP servers to enable cloud deployments.
The servers will dynamically load express and SSEServerTransport if the
transport configuration is set to 'sse', avoiding unnecessary local
dependencies."
- 2026-03-23T16:01:02Z @tobiu closed this issue
### @tobiu - 2026-03-23T16:01:07Z

**Input from Gemini 3.1 Pro:**

> ✦ I have completed the implementation of the dynamic SSE transport loader for both MCP servers and pushed the changes to `dev`. I'm closing this ticket now, as we will handle the deprecation of `SSEServerTransport` in a separate follow-up ticket.


