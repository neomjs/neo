---
id: 7949
title: Refactor Shared Tool Validation Service for MCP Client and Server
state: OPEN
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-30T13:50:46Z'
updatedAt: '2025-11-30T13:51:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7949'
author: tobiu
commentsCount: 0
parentIssue: 7931
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Refactor Shared Tool Validation Service for MCP Client and Server

## Context
We implemented basic client-side validation in #7946. However, the validation logic is currently fragmented. We want to unify it by moving the tool service to a shared location.

## Goal
Refactor `ai/mcp/server/toolService.mjs` to be a shared resource for both Clients and Servers.

## Requirements
1.  **Relocate File:** Move `ai/mcp/server/toolService.mjs` one folder level up (to `ai/mcp/toolService.mjs`) to allow shared access.
2.  **Add `validateToolInput()`:** Implement a shared method `validateToolInput(toolName, args, schema)` within the shared service.
3.  **Refactor Client & Server:** Update both `Neo.ai.mcp.client.Client` and the MCP Servers to import and use this shared service for validation.
4.  **Server Type Strategy:**
    *   Implement a check to determine if the connected server is one of our internal servers (GitHub, Knowledge Base, Memory Core).
    *   Ensure validation logic is applied appropriately for internal servers (using our shared logic). For external servers, we need to decide if we validate against the provided JSON schema or skip strict validation.

## Deliverables
-   Shared `ai/mcp/toolService.mjs`.
-   Updated `Client.mjs` and Server implementations.


## Activity Log

- 2025-11-30 @tobiu added the `enhancement` label
- 2025-11-30 @tobiu added the `ai` label
- 2025-11-30 @tobiu added the `refactoring` label
- 2025-11-30 @tobiu assigned to @tobiu
- 2025-11-30 @tobiu added parent issue #7931

