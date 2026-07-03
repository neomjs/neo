---
id: 9847
title: 'feat: Implement `remove_component` Neural Link Tool'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - neo-opus-vega
createdAt: '2026-04-10T08:33:25Z'
updatedAt: '2026-06-15T19:46:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9847'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy:
  - '[x] 9846 feat: Implement `create_component` Neural Link Tool'
blocking:
  - '[ ] 9848 feat: Implement Neural Link Transaction/Undo Stack for Agent-Driven UI Mutations'
closedAt: '2026-06-14T08:03:26Z'
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
- 2026-06-12T18:17:25Z @neo-gpt marked this issue as being blocked by #9846
### @neo-gpt - 2026-06-12T18:17:45Z

**Input from GPT-5 (Codex Desktop):**

> ● Backlog cleanup / topology note — no implementation claim.
> 
> V-B-A current-state check:
> 
> - `create_component` and `remove_component` are still absent from the Neural Link MCP tool surface: neither `ai/mcp/server/neural-link/toolService.mjs` nor `openapi.yaml` maps those operation ids today.
> - The prior intake blockers remain current: both #9846 and this ticket lack a Contract Ledger for the new agent-consumed MCP API surface.
> - This ticket is not standalone as written: its own snapshot semantics require enough state to recreate the removed component, and its body describes `remove_component` as the symmetric counterpart to `create_component`.
> 
> Cleanup applied: I formalized `#9847 blocked_by #9846`.
> 
> I am deliberately not hard-linking this as blocked by #9848 yet. #9848 is the full transaction/undo stack; this ticket can still become valid as a limited snapshot-only MVP if the Contract Ledger explicitly defers full transaction integration. The next cleanup step for this ticket is therefore contract/topology clarification, not code.

- 2026-06-12T18:43:12Z @neo-gpt marked this issue as blocking #9848
- 2026-06-12T18:43:42Z @neo-gpt cross-referenced by #9848
- 2026-06-14T04:49:27Z @neo-opus-vega assigned to @neo-opus-vega
- 2026-06-14T05:04:41Z @neo-opus-vega cross-referenced by #13186
- 2026-06-14T05:05:14Z @neo-opus-ada cross-referenced by #13187
- 2026-06-14T05:05:54Z @neo-opus-vega removed the `needs-re-triage` label
- 2026-06-14T05:07:01Z @neo-opus-vega cross-referenced by PR #13188
- 2026-06-14T08:03:26Z @tobiu referenced in commit `55d0acc` - "feat(neural-link): add remove_component tool — validate id + delegate destroy(true) (#9847) (#13188)"
- 2026-06-14T08:03:26Z @tobiu closed this issue
- 2026-06-14T08:13:25Z @neo-opus-vega cross-referenced by PR #13201
- 2026-06-14T12:04:19Z @neo-opus-vega cross-referenced by #13221
- 2026-06-14T23:19:04Z @neo-opus-vega cross-referenced by #13272
- 2026-06-14T23:31:14Z @neo-opus-vega cross-referenced by PR #13274

