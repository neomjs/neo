---
id: 9533
title: Migrate MCP servers from SSEServerTransport to StreamableHTTPServerTransport
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-03-23T16:03:40Z'
updatedAt: '2026-03-23T16:56:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9533'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-23T16:56:17Z'
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
- 2026-03-23T16:49:39Z @tobiu referenced in commit `4ad5e3a` - "refactor(ai): Migrate MCP servers to StreamableHTTPServerTransport (#9533)

Refactors the SSE transport implementation in knowledge-base and memory-core
MCP servers to use the modern StreamableHTTPServerTransport from the
latest @modelcontextprotocol/sdk. This replaces the deprecated
SSEServerTransport and uses the unified /mcp endpoint for both
SSE streams and HTTP messages, along with stateful session management
and DNS rebinding protection via createMcpExpressApp."
### @tobiu - 2026-03-23T16:49:58Z

**Input from Gemini 3.1 Pro:**

> ✦ ✦ I have completed the migration.
> 
> I successfully refactored the dynamic SSE transport logic in both `knowledge-base/Server.mjs` and `memory-core/Server.mjs` to use `StreamableHTTPServerTransport` from the new `@modelcontextprotocol/sdk`. 
> 
> The endpoints have been unified under `/mcp`, utilizing `createMcpExpressApp` to ensure DNS rebinding protection. I also implemented stateful session management utilizing `sessionIdGenerator` to map distinct client sessions seamlessly.
> 
> Changes have been successfully committed and pushed to `dev`. I'll close this ticket now.

- 2026-03-23T16:55:44Z @tobiu referenced in commit `fbffa1e` - "perf(ai): Use dynamic import for StdioServerTransport (#9533)

Optimizes MCP server startup by dynamically importing StdioServerTransport
only when the 'sse' transport is not configured."
### @tobiu - 2026-03-23T16:55:57Z

**Input from Gemini 3.1 Pro:**

> ✦ ✦ I agree, that's a good optimization. I've updated both servers to dynamically import `StdioServerTransport` only when falling back to stdio. The changes have been pushed, and I will now close this issue.

- 2026-03-23T16:56:17Z @tobiu closed this issue
- 2026-03-23T17:04:16Z @tobiu referenced in commit `127ea55` - "refactor(ai): Remove obsolete transport class field (#9533)

Converts the transport instance in the stdio fallback branch to a local
variable and removes the unused class field, since SSE mode now uses a
map of session transports."
- 2026-03-23T17:15:36Z @tobiu referenced in commit `e276e4d` - "docs(ai): Document SSE transport options for MCP servers (#9533)

Updates the Knowledge Base and Memory Core documentation to explain how
to configure and use the StreamableHTTPServerTransport (SSE) for
cloud-native Docker deployments."
- 2026-03-23T17:16:56Z @tobiu referenced in commit `5c9bf67` - "docs(ai): Update JSDoc for MCP Server classes (#9533)

Updates the JSDoc comments for both the knowledge-base and memory-core
Server.mjs files to accurately reflect the dual-transport architecture
and configuration options implemented during the migration to
StreamableHTTPServerTransport."

