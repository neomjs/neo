---
id: 8191
title: 'Feat: Neural Link - Global Config Management'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-28T21:30:46Z'
updatedAt: '2026-01-04T10:16:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8191'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-04T10:16:50Z'
---
# Feat: Neural Link - Global Config Management

**Context:**
`Neo.config` controls framework-level behavior. While some configs are boot-time constants (e.g., `useSharedWorkers`, `environment`), others are runtime-mutable (e.g., `themes`, custom app flags). Agents need access to this system.

**Scope:**

1.  **Enhance `RuntimeService`:**
    -   Add `getNeoConfig(sessionId)`.
        -   Implementation: Return `Neo.config`.
    -   Add `setNeoConfig(sessionId, config)`.
        -   Implementation: Call `Neo.setGlobalConfig(config)`.

2.  **Tools:**
    -   `get_neo_config`: Returns the `Neo.config` object.
    -   `set_neo_config`: Accepts a partial config object.
    -   **Documentation:** Explicitly warn that changing boot-time configs (workers, environment) at runtime may not work or could cause instability.

**Goal:** Enable runtime configuration management.

## Timeline

- 2025-12-28T21:30:47Z @tobiu added the `enhancement` label
- 2025-12-28T21:30:47Z @tobiu added the `ai` label
- 2025-12-28T21:30:56Z @tobiu added parent issue #8169
- 2026-01-04T09:45:42Z @tobiu assigned to @tobiu
- 2026-01-04T10:15:14Z @tobiu referenced in commit `7d9bdd7` - "Feat: Neural Link - Global Config Management #8191"
### @tobiu - 2026-01-04T10:16:28Z

**Input from Gemini 2.5 pro:**

> ✦ I have successfully implemented the **Global Config Management** feature for the Neural Link, enabling runtime inspection and modification of `Neo.config`.
> 
> ### Enhanced Scope: Multi-Window Awareness
> During implementation, we identified a critical need to distinguish between the shared global state and the initial boot configuration of individual windows. We enhanced the `get_neo_config` tool to support an optional `windowId` parameter:
> - **Global Config (Default):** Returns the current, merged `Neo.config` shared across the App Worker.
> - **Window Boot Config:** If `windowId` is provided, returns the specific configuration used to initialize that window (stored in `Neo.windowConfigs`), allowing agents to inspect the "origin story" of a specific view.
> 
> ### Affected Files
> **Client-Side:**
> - `src/ai/client/RuntimeService.mjs`: Added `getNeoConfig` and `setNeoConfig` methods.
> 
> **Server-Side:**
> - `ai/mcp/server/neural-link/services/RuntimeService.mjs`: Added bridge methods to delegate config requests to the client.
> - `ai/mcp/server/neural-link/services/toolService.mjs`: Registered `get_neo_config` and `set_neo_config` tools.
> - `ai/mcp/server/neural-link/openapi.yaml`: Defined the new API endpoints and schemas, including safety warnings for runtime config changes.
> 
> ### Documentation Cleanup
> We also performed a cleanup pass to ensure `windowId` is consistently typed as `String` (UUID) across all JSDocs and API definitions, correcting legacy `Number`/`integer` references.

- 2026-01-04T10:16:50Z @tobiu closed this issue

