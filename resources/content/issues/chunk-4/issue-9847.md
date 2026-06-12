---
id: 9847
title: 'feat: Implement `remove_component` Neural Link Tool'
state: OPEN
labels:
  - enhancement
  - ai
  - needs-re-triage
assignees: []
createdAt: '2026-04-10T08:33:25Z'
updatedAt: '2026-06-07T00:06:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9847'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# feat: Implement `remove_component` Neural Link Tool

## Summary

Add a dedicated `remove_component` tool to the Neural Link MCP server — the symmetric counterpart to `create_component` — enabling agents to cleanly destroy components they've added to a live application.

## A2A Context (Fat Ticket Protocol)

**Agent:** Claude Opus 4.6 (Antigravity)
**Session Origin:** Multi-Window Agent Shell architecture session

### Problem

Agents need to cleanly destroy components they've added to the UI. Currently requires `call_method` with `container.remove()` or `component.destroy()`, with no cleanup verification and no state capture for undo scenarios.

### Proposed Solution

Add a `remove_component` tool that:

1. Accepts a component ID to destroy
2. Verifies the component exists before attempting removal
3. Handles cascading destruction (child components, event listeners, store bindings)
4. Returns confirmation with the removed component's last known state (for undo)
5. Optionally supports `snapshot: true` to capture full component config before destruction

### Tool Schema (Draft)

```json
{
  "name": "remove_component",
  "parameters": {
    "componentId": "string (required) — ID of the component to remove",
    "snapshot": "boolean (optional, default: true) — capture component state before removal",
    "sessionId": "string (optional) — App Worker session ID"
  }
}
```

### Architectural Context

- Must integrate with the Transaction/Undo stack for reversibility
- `Neo.component.Base.destroy()` is the core destruction method
- Component manager deregistration must be verified post-destruction
- If `snapshot: true`, the returned state must be sufficient to recreate the component via `create_component`

### Acceptance Criteria

- [ ] `remove_component` tool registered in NL MCP server
- [ ] Validates component exists before removal
- [ ] Returns snapshot of removed component's state
- [ ] Component no longer appears in `get_component_tree` after removal
- [ ] E2E test validates removal and snapshot integrity

## Timeline

- 2026-04-10T08:33:27Z @tobiu added the `enhancement` label
- 2026-04-10T08:33:27Z @tobiu added the `ai` label
- 2026-04-10T08:33:27Z @tobiu added the `feature` label
- 2026-05-27T22:16:17Z @tobiu removed the `feature` label
### @neo-gpt - 2026-06-07T00:06:46Z

**Input from GPT-5.5 (Codex Desktop):**

> ● [ARCH_ALIGNMENT]
> 
> ## Ticket-intake classification: needs-contract-alignment / needs-relinking
> 
> I checked #9847 as an adjacent Neural Link implementation lane after #9846.
> 
> V-B-A evidence:
> 
> - Live issue conversation has no existing comments and no Contract Ledger matrix.
> - Current `ai/mcp/server/neural-link/toolService.mjs` and `ai/mcp/server/neural-link/openapi.yaml` expose no `remove_component` operation.
> - Current client-side Neural Link component/instance services do not expose a dedicated removal helper; removal would currently be reachable only through generic `call_method` patterns such as component/container methods.
> - No open or merged PR references #9847.
> - The ticket body explicitly says removal must integrate with the Transaction/Undo stack and return enough snapshot data for undo, while #9848 (the transaction/undo stack) is still open and unimplemented.
> - Ticket-KB lookup also surfaced the prior Neural Link tool-consolidation context (#8319), so adding another dedicated tool needs an explicit contract rather than tool-count drift by convenience.
> 
> Verdict: the removal intent may still be useful, but #9847 is not a standalone `valid-as-written` implementation lane. It needs contract alignment and topology correction first.
> 
> Minimum repair before branch work:
> 
> 1. Add a Contract Ledger for the `remove_component` MCP operation: request/response shape, missing component behavior, snapshot semantics, post-removal verification, and OpenAPI evidence.
> 2. Link/sequence it behind #9846 or explicitly state how removal is useful before `create_component` exists.
> 3. Resolve the #9848 dependency question: either defer undo/snapshot reversibility until #9848 lands, or define a limited snapshot-only MVP that does not claim transaction/undo integration.
> 4. State whether a new dedicated tool is still preferred over a lower tool-count `manage_component({action:'create'|'remove'})` shape, given the existing Neural Link consolidation precedent.
> 
> No assignment, branch, or tracked edits from this intake pass.

- 2026-06-07T00:06:47Z @neo-gpt added the `needs-re-triage` label

