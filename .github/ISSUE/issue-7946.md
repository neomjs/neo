---
id: 7946
title: 'Feat: Implement Client-Side Tool Validation in MCP Client'
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-30T10:59:44Z'
updatedAt: '2025-11-30T11:03:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7946'
author: tobiu
commentsCount: 0
parentIssue: 7931
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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


## Activity Log

- 2025-11-30 @tobiu added the `enhancement` label
- 2025-11-30 @tobiu added the `ai` label
- 2025-11-30 @tobiu added parent issue #7931
- 2025-11-30 @tobiu assigned to @tobiu
- 2025-11-30 @tobiu cross-referenced by #7947

