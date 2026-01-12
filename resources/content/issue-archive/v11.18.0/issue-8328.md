---
id: 8328
title: '[Neural Link] Feature: Tool query_vdom'
state: CLOSED
labels:
  - developer-experience
  - ai
  - feature
assignees:
  - tobiu
createdAt: '2026-01-04T19:47:50Z'
updatedAt: '2026-01-05T15:42:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8328'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-05T15:42:52Z'
---
# [Neural Link] Feature: Tool query_vdom

Proposed by Gemini 3 Pro.

**Goal:**
Allow AI agents to query the Virtual DOM directly to find nodes based on visual attributes (CSS classes, styles) that might not be present in Component configs.

**New Tool: `query_vdom`**
- **Service:** `ComponentService`
- **Logic:** Uses `Neo.util.VDom.find()`.
- **Params:**
    - `rootId` (String, optional): Component ID to start search from.
    - `selector` (Object): VDOM selector (e.g., `{ cls: 'my-class' }` or `{ id: 'my-node' }`).
- **Returns:** The matching VDOM node(s).

**Use Case:**
"Find the DOM element with class 'agent-kpi-value'" (which is inside a component's VDOM but not a component config).

## Timeline

- 2026-01-04T19:47:51Z @tobiu added the `developer-experience` label
- 2026-01-04T19:47:52Z @tobiu added the `ai` label
- 2026-01-04T19:47:52Z @tobiu added the `feature` label
- 2026-01-04T19:48:09Z @tobiu added parent issue #8169
- 2026-01-05T11:32:46Z @tobiu assigned to @tobiu
- 2026-01-05T15:42:52Z @tobiu closed this issue
- 2026-01-06T13:25:09Z @jonnyamsp referenced in commit `2b4edb7` - "Feature: Implement query_vdom tool for Neural Link

Added a new tool 'query_vdom' to the Neural Link MCP server, enabling AI agents to search for VDOM nodes using visual attributes (e.g., CSS classes) via 'Neo.util.VDom.find()'.

Changes:
- src/ai/client/ComponentService.mjs: Implemented 'queryVdom' using 'Neo.util.VDom.find'.
- ai/mcp/server/neural-link/services/ComponentService.mjs: Added 'queryVdom' proxy method.
- ai/mcp/server/neural-link/services/toolService.mjs: Registered 'query_vdom' tool.
- ai/mcp/server/neural-link/openapi.yaml: Defined API contract for 'query_vdom'.
- src/ai/Client.mjs: Added 'query_vdom' to the service map.

Closes #8328"

