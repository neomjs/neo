---
id: 8309
title: 'Feat: Neural Link - Get Method Source'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-04T12:54:52Z'
updatedAt: '2026-01-04T13:07:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8309'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-04T13:07:04Z'
---
# Feat: Neural Link - Get Method Source

**Context:**
To safely hot-patch code (Issue #8190), agents need to read the current implementation of a method. This is critical for "read-modify-write" workflows and works across all environments (dev, dist/esm, prod) by retrieving the actual runtime source via `Function.toString()`.

**Scope:**
1.  **Client (`RuntimeService.mjs`):**
    -   Implement `getMethodSource({className, methodName})`.
    -   Logic: `Neo.ns(className).prototype[methodName].toString()`.
2.  **Server (MCP):**
    -   Expose `get_method_source` tool.
    -   Update OpenAPI definition.

**Goal:**
Enable agents to see the code they are about to patch.

## Timeline

- 2026-01-04T12:54:53Z @tobiu added the `enhancement` label
- 2026-01-04T12:54:53Z @tobiu added the `ai` label
- 2026-01-04T12:54:54Z @tobiu added the `architecture` label
- 2026-01-04T12:55:04Z @tobiu added parent issue #8169
- 2026-01-04T12:55:19Z @tobiu assigned to @tobiu
- 2026-01-04T13:05:08Z @tobiu referenced in commit `e23f496` - "feat(ai): Implement Get Method Source & Refine Hot-Patching (#8309)

- Add RuntimeService.getMethodSource using Neo.typeOf for robust prototype resolution.
- Update patch_code OpenAPI description to recommend get_method_source as a prerequisite.
- Finalize get_method_source tool exposure."
- 2026-01-04T13:05:57Z @tobiu referenced in commit `206b172` - "feat(ai): Expose Get Method Source Tool (Remaining Files) (#8309)

- Register get_method_source in Neo.ai.Client service map.
- Add getMethodSource proxy method to mcp/server/neural-link/services/RuntimeService.mjs."
### @tobiu - 2026-01-04T13:06:32Z

**Input from Gemini 3 pro:**

> ✦ Implemented `get_method_source` tool.
> 
> **Key Implementation Details:**
> - **Robust Type Detection:** The client-side implementation in `RuntimeService.mjs` uses `Neo.typeOf(cls)` to correctly differentiate between `NeoClass` (using `cls.prototype`) and `NeoInstance` (using `cls.constructor.prototype`). This ensures it works for both standard classes and singletons (like `Neo.worker.App`).
> - **Source Retrieval:** Uses `Function.prototype.toString()` to retrieve the exact runtime source code of the method.
> - **Workflow:** This tool is explicitly documented in OpenAPI as the **prerequisite step** for the `patch_code` tool, enabling a safe "read-modify-write" hot-patching cycle.
> - **Full Stack:** Exposed via `Neo.ai.Client` mapping and the Neural Link MCP Server proxy.

- 2026-01-04T13:07:04Z @tobiu closed this issue

