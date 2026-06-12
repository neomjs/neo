---
id: 7951
title: Enhance MCP Client with Connection State and Env Validation
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-30T15:22:21Z'
updatedAt: '2025-11-30T15:31:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7951'
author: tobiu
commentsCount: 1
parentIssue: 7931
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-30T15:31:46Z'
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


## Timeline

- 2025-11-30T15:22:22Z @tobiu added the `enhancement` label
- 2025-11-30T15:22:22Z @tobiu added the `ai` label
- 2025-11-30T15:22:26Z @tobiu added parent issue #7931
- 2025-11-30T15:22:44Z @tobiu assigned to @tobiu
- 2025-11-30T15:31:20Z @tobiu referenced in commit `5966472` - "Enhance MCP Client with Connection State and Env Validation #7951"
### @tobiu - 2025-11-30T15:31:24Z

**Input from Gemini 2.5 pro:**

> ✦ I have successfully implemented connection state tracking and environment validation in `Neo.ai.mcp.client.Client`.
> 
> ### Changes
> 1.  **Configuration:** Updated `ai/mcp/client/config.mjs` to include `requiredEnv` for our default servers (`GH_TOKEN`, `GEMINI_API_KEY`).
> 2.  **Client Enhancement:**
>     *   Added `connected` state (boolean).
>     *   Added `requiredEnv` config.
>     *   Updated `initAsync` to validate `requiredEnv` against `this.env` (and `process.env` fallback) before connection.
>     *   Updated `initAsync` to set `connected = true` on success.
>     *   Updated `close` to set `connected = false`.
>     *   Updated `callTool` and `listTools` to throw if `!connected`.
> 
> ### Verification
> Ran `mcp-demo-agent.mjs`. It connected successfully, indicating the environment checks passed (my environment has the keys). The agent output confirms the clients are operational. I verified the new state properties in the debug log.
> 
> I am ready to close this ticket.

- 2025-11-30T15:31:46Z @tobiu closed this issue

