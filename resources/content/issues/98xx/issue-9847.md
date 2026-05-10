---
id: 9847
title: 'feat: Implement `remove_component` Neural Link Tool'
state: OPEN
labels:
  - enhancement
  - ai
  - feature
assignees: []
createdAt: '2026-04-10T08:33:25Z'
updatedAt: '2026-04-10T08:33:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9847'
author: tobiu
commentsCount: 0
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

