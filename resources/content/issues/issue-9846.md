---
id: 9846
title: 'feat: Implement `create_component` Neural Link Tool'
state: OPEN
labels:
  - enhancement
  - ai
  - feature
assignees: []
createdAt: '2026-04-10T08:33:14Z'
updatedAt: '2026-04-10T08:33:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9846'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# feat: Implement `create_component` Neural Link Tool

## Summary

Add a dedicated `create_component` tool to the Neural Link MCP server that provides a first-class, schema-validated interface for agents to dynamically create components within live Neo.mjs applications at runtime.

## A2A Context (Fat Ticket Protocol)

**Agent:** Claude Opus 4.6 (Antigravity)
**Session Origin:** Multi-Window Agent Shell architecture session

### Problem

Currently, runtime component creation via Neural Link requires agents to use the generic `call_method` tool (e.g., calling `container.add()` on a target container). This works but lacks:

- **Schema validation** — no enforcement that the component config is valid before dispatching
- **Window targeting** — in multi-window SharedWorker apps, the agent must manually resolve which window's container to target
- **Error handling** — `call_method` returns raw errors with no semantic context about what went wrong
- **Discoverability** — agents must know the internal API (`container.add()`) rather than expressing intent

### Proposed Solution

Add a dedicated `create_component` tool to the Neural Link MCP server that:

1. Accepts a component config (`ntype`/`module`, properties) and a target container ID
2. Validates the config against known class blueprints (via `inspect_class`)
3. Handles multi-window routing via the existing SharedWorker bridge
4. Returns the created component's ID and serialized state
5. Supports optional `windowId` parameter for explicit window targeting

### Tool Schema (Draft)

```json
{
  "name": "create_component",
  "parameters": {
    "containerId": "string (required) — ID of the target container",
    "config": "object (required) — Neo.mjs component config (ntype, text, items, etc.)",
    "index": "number (optional) — insertion index within the container's items",
    "windowId": "string (optional) — target window in multi-window apps",
    "sessionId": "string (optional) — App Worker session ID"
  }
}
```

### Architectural Context

- **Bridge.mjs** (`ai/mcp/server/neural-link/Bridge.mjs`) — WebSocket hub between App Workers and agents
- **InstanceService** (`src/ai/client/InstanceService.mjs`) — `callMethod()` at line ~85-130 is the current workaround
- **Related:** #9535 (conversational UIs concept), #9671 (agent evolution roadmap)
- **Dependency:** None — additive to the existing NL tool surface

### Pitfalls Identified

- Component creation must go through the App Worker, not the Main Thread — the bridge must route correctly
- The created component needs to be registered in `Neo.manager.Component` for subsequent NL queries to find it
- If `useSharedWorkers: true`, the creation must be dispatchable to a specific window's DOM
- Must handle both `ntype`-based (lazy) and `module`-based (explicit import) component resolution

### Acceptance Criteria

- [ ] `create_component` tool registered in NL MCP server
- [ ] Schema validation rejects invalid configs with actionable error messages
- [ ] Created components appear in `get_component_tree` results
- [ ] Multi-window targeting works when `useSharedWorkers: true`
- [ ] E2E test validates component creation and subsequent inspection

## Timeline

- 2026-04-10T08:33:15Z @tobiu added the `enhancement` label
- 2026-04-10T08:33:15Z @tobiu added the `ai` label
- 2026-04-10T08:33:15Z @tobiu added the `feature` label

