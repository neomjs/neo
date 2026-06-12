---
id: 7946
title: 'Feat: Implement Client-Side Tool Validation in MCP Client'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-30T10:59:44Z'
updatedAt: '2025-11-30T13:40:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7946'
author: tobiu
commentsCount: 1
parentIssue: 7931
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-30T13:40:43Z'
---
# Feat: Implement Client-Side Tool Validation in MCP Client

## Goal
Implement client-side validation for tool calls in `Neo.ai.mcp.client.Client`.

## Context
Our MCP servers already validate tool shapes using Open API specs (`ai/mcp/server/toolService.mjs`). However, the current `Neo.ai.mcp.client.Client` implementation sends raw arguments to the server without pre-validation.

## Requirement
The `Client` should:
1.  Fetch the tool schema via `listTools()`.
2.  Before sending a request via `callTool()`, validate the arguments against the schema.
3.  Throw a descriptive error if validation fails, providing immediate feedback to the agent (the caller) about the contract violation.

## Value
-   **Safety:** Prevents "derailment" caused by sending malformed data to the server.
-   **Feedback:** Gives agents precise details on what they did wrong (contract violation) without needing a round-trip to the server.


## Timeline

- 2025-11-30T10:59:45Z @tobiu added the `enhancement` label
- 2025-11-30T10:59:46Z @tobiu added the `ai` label
- 2025-11-30T11:00:51Z @tobiu added parent issue #7931
- 2025-11-30T11:03:02Z @tobiu assigned to @tobiu
- 2025-11-30T12:24:18Z @tobiu cross-referenced by #7947
- 2025-11-30T13:38:51Z @tobiu referenced in commit `79dd59f` - "Feat: Implement Client-Side Tool Validation in MCP Client #7946"
### @tobiu - 2025-11-30T13:40:29Z

**Input from Gemini 2.5 pro:**

> ✦ I have successfully implemented client-side tool validation in `Neo.ai.mcp.client.Client`.
> 
> ### Verification of Necessity
> I confirmed that the `@modelcontextprotocol/sdk` client does **not** perform schema validation on tool arguments before sending requests. It only validates the JSON-RPC protocol structure. This was proven by disabling my custom logic, which resulted in the server (not the client) catching the invalid input.
> 
> ### Implementation
> 1.  **Schema Caching:** `Client.mjs` now caches tool schemas during initialization.
> 2.  **Validation:** A new `validateSchema` method enforces the contract (types, required fields, enums) on the client side.
> 3.  **Interception:** `callTool` now validates arguments before the request leaves the client.
> 
> This enhancement ensures immediate feedback for agents and prevents unnecessary network round-trips for malformed requests.

- 2025-11-30T13:40:43Z @tobiu closed this issue
- 2025-11-30T13:50:47Z @tobiu cross-referenced by #7949

