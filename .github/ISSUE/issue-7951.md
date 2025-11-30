---
id: 7951
title: Enhance MCP Client with Connection State and Env Validation
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-30T15:22:21Z'
updatedAt: '2025-11-30T15:22:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7951'
author: tobiu
commentsCount: 0
parentIssue: 7931
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Enhance MCP Client with Connection State and Env Validation

## Context
A recent architectural review suggested improvements to the `Neo.ai.mcp.client.Client` configuration and state management.

## Goal
Enhance the MCP Client with connection state tracking and environment variable validation to improve robustness and developer experience.

## Requirements
1.  **Connection State:** Add a `connected` config to `Client.mjs`.
    *   **Type:** Non-reactive config (class field or config without underscore, unless we identify a need for reactivity later).
    *   **Logic:** Set to `true` after successful connection in `initAsync`. Set to `false` in `close`.
    *   **Benefit:** Allows agents to check connection status before attempting operations.
2.  **Environment Validation:** Add `requiredEnv` support to `ai/mcp/client/config.mjs` and `Client.mjs`.
    *   **Config:** Update `ClientConfig` schema (conceptually) to support a `requiredEnv: String[]` array in the server definition.
    *   **Validation:** In `Client.mjs` `initAsync`, check if the defined required environment variables exist in the `env` object (or `process.env`). Throw a descriptive error if any are missing *before* attempting to spawn the server process.
    *   **Benefit:** Fail-fast with clear error messages instead of cryptic spawn failures.

## Deliverables
-   Updated `ai/mcp/client/Client.mjs`.
-   Updated `ai/mcp/client/config.mjs` (example/default config to include required envs for our servers, e.g., `GH_TOKEN`).


## Activity Log

- 2025-11-30 @tobiu added the `enhancement` label
- 2025-11-30 @tobiu added the `ai` label
- 2025-11-30 @tobiu added parent issue #7931
- 2025-11-30 @tobiu assigned to @tobiu

