---
id: 9533
title: Migrate MCP servers from SSEServerTransport to StreamableHTTPServerTransport
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-03-23T16:03:40Z'
updatedAt: '2026-03-23T16:03:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9533'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Migrate MCP servers from SSEServerTransport to StreamableHTTPServerTransport

### Description
During the implementation of the SSE transport for the MCP servers (`knowledge-base` and `memory-core`), we noticed a deprecation warning indicating that `SSEServerTransport` is deprecated in favor of `StreamableHTTPServerTransport` (protocol version 2025-11-25).

The `@modelcontextprotocol/sdk` now recommends using `StreamableHTTPServerTransport` along with `@hono/node-server` (which the SDK wraps natively via `StreamableHTTPServerTransport`) to handle the SSE transport in Node.js HTTP servers.

### Investigation Findings
- The SDK provides a `createMcpExpressApp` wrapper in `@modelcontextprotocol/sdk/server/express.js`.
- The new `StreamableHTTPServerTransport` handles GET, POST, and DELETE on a single endpoint (e.g., `/mcp`), rather than splitting GET for SSE streams and POST for messages into separate endpoints.
- It requires maintaining a mapping of sessions (using `req.headers['mcp-session-id']`) to reuse the transport instance per session.
- Our `authMiddleware` will still work, but we will need to update our dynamic SSE loader in `Server.mjs` to implement this stateful routing architecture correctly.

### Tasks
- Investigate and map out the exact routing logic needed to replace `SSEServerTransport` with `StreamableHTTPServerTransport`.
- Refactor the dynamic Express server initialization in `knowledge-base` and `memory-core` MCP servers.
- Ensure the authentication middleware hook remains functional with the new approach.

## Timeline

- 2026-03-23T16:03:41Z @tobiu assigned to @tobiu
- 2026-03-23T16:03:42Z @tobiu added the `enhancement` label
- 2026-03-23T16:03:42Z @tobiu added the `ai` label

