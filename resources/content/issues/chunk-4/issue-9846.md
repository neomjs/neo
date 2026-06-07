---
id: 9846
title: 'feat: Implement `create_component` Neural Link Tool'
state: OPEN
labels:
  - enhancement
  - ai
  - needs-re-triage
assignees: []
createdAt: '2026-04-10T08:33:14Z'
updatedAt: '2026-06-07T00:05:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9846'
author: tobiu
commentsCount: 1
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
- 2026-05-27T22:16:17Z @tobiu removed the `feature` label
### @neo-gpt - 2026-06-07T00:05:19Z

**Input from GPT-5.5 (Codex Desktop):**

> ● [ARCH_ALIGNMENT]
> 
> ## Ticket-intake classification: needs-contract-alignment
> 
> I checked #9846 as a possible Neural Link implementation lane before branching.
> 
> V-B-A evidence:
> 
> - Live issue conversation has no existing comments and the body provides a draft `create_component` schema, but no Contract Ledger matrix.
> - Current `ai/mcp/server/neural-link/toolService.mjs` maps `call_method`, `get_component_tree`, `query_component`, `simulate_event`, etc.; there is no `create_component` mapping.
> - Current `ai/mcp/server/neural-link/openapi.yaml` exposes `call_method` and component inspection/query tools, but no `create_component` operation.
> - Current client-side `src/ai/client/ComponentService.mjs` supports inspection/query/render-tree helpers, while `src/ai/client/InstanceService.mjs` exposes the generic `callMethod()` workaround described by the ticket.
> - Duplicate/successor sweep found no open or merged PR for #9846 and no stronger duplicate ticket in the ticket KB query.
> 
> Verdict: the feature intent still matches current reality, but implementation is blocked by the Contract Completeness Gate. A new public MCP tool is agent-consumed API surface; per `learn/agentos/process/contract-ledger.md`, this ticket needs a Contract Ledger before branch work.
> 
> Minimum alignment needed before claim:
> 
> | Target Surface | Source of Authority | Proposed Behavior | Fallback / Edge Case | Docs | Evidence |
> |---|---|---|---|---|---|
> | `create_component` MCP tool / OpenAPI operation | #9846 + Neural Link MCP tool surface | Define exact request/response envelope, including `containerId`, `config`, optional `index`, optional `windowId`, and `sessionId` routing semantics | Define validation failure, missing container, unsupported config, and creation failure payloads | `openapi.yaml`, service/client JSDoc, optional Neural Link docs | OpenAPI/tool-list validation plus e2e proof that created component appears in `get_component_tree` |
> | Client-side component creation boundary | Current App Worker `ComponentService` / Neo component manager | Define whether creation calls `container.add(config)` directly or a narrower helper, and how the created component is serialized | Define behavior for non-container targets, invalid index, and multi-window routing mismatch | JSDoc at the owning client service method | Focused e2e against a real app worker |
> 
> No assignment, branch, or tracked edits from this intake pass.

- 2026-06-07T00:05:20Z @neo-gpt added the `needs-re-triage` label
- 2026-06-07T00:06:47Z @neo-gpt cross-referenced by #9847

