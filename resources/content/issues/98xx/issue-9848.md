---
id: 9848
title: 'feat: Implement Neural Link Transaction/Undo Stack for Agent-Driven UI Mutations'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
  - feature
assignees: []
createdAt: '2026-04-10T08:33:27Z'
updatedAt: '2026-04-10T08:33:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9848'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# feat: Implement Neural Link Transaction/Undo Stack for Agent-Driven UI Mutations

## Summary

Implement a transaction stack within the Neural Link server that records all agent-driven UI mutations as reversible operations, enabling undo/redo, atomic batching, and session-persistent audit trails.

## A2A Context (Fat Ticket Protocol)

**Agent:** Claude Opus 4.6 (Antigravity)
**Session Origin:** Multi-Window Agent Shell architecture session

### Problem

When agents modify a live UI (creating/removing components, setting properties), there is no mechanism to:

- **Undo** a mutation ("undo that", "go back")
- **Batch** related mutations into a single atomic transaction
- **Persist** the mutation history for session replay
- **Audit** what an agent changed and when

This is a hard requirement for conversational UIs where non-technical users interact with agents that modify their application in real-time. Users must be able to say "undo that" and have confidence the system will revert cleanly.

### Proposed Solution

Implement a transaction stack that:

1. Records every mutation (`create_component`, `remove_component`, `set_instance_properties`) as a reversible operation
2. Supports `undo(n)` and `redo(n)` operations via dedicated NL tools
3. Groups related mutations into named transactions (e.g., "add-summary-grid")
4. Optionally persists the stack to the Memory Core for cross-session continuity

### Design

```javascript
// Transaction Model
{
  id:         'tx-001',
  name:       'add-summary-grid',
  timestamp:  '2026-04-10T10:30:00Z',
  operations: [
    {
      type:    'create_component',
      target:  'neo-container-42',
      forward: { ntype: 'grid', columns: [...] },
      reverse: { action: 'remove_component', componentId: 'neo-grid-99' }
    },
    {
      type:    'set_instance_properties',
      target:  'neo-container-42',
      forward: { height: 400 },
      reverse: { height: 300 }
    }
  ],
  status: 'committed' // | 'rolled-back'
}
```

### New Tools Required

| Tool | Description |
|---|---|
| `undo` | Reverts the last N transactions |
| `redo` | Re-applies the last N undone transactions |
| `list_transactions` | Returns the transaction history |
| `begin_transaction` | Starts a named transaction group |
| `commit_transaction` | Commits the current transaction group |

### Architectural Context

- Foundational for the Multi-Window Agent Shell concept
- Must work across SharedWorker boundaries (all windows share the transaction stack)
- The Memory Core integration means an agent can resume modifications across sessions
- The stack lives in the NL server process, not in the App Worker

### Pitfalls Identified

- Property mutations via `set_instance_properties` need to capture the *previous* value for the reverse operation — this requires a pre-read before every set
- Component creation reverse operations need the component ID (only known after creation), so forward ops must be awaited before the reverse is finalized
- In SharedWorker mode, the transaction stack must be window-agnostic (a single stack across all windows)

### Acceptance Criteria

- [ ] Transaction recording for `create_component`, `remove_component`, `set_instance_properties`
- [ ] `undo` and `redo` tools functional
- [ ] Named transaction grouping via `begin_transaction`/`commit_transaction`
- [ ] E2E test: create component → undo → verify component removed → redo → verify component restored

## Timeline

- 2026-04-10T08:33:28Z @tobiu added the `enhancement` label
- 2026-04-10T08:33:28Z @tobiu added the `ai` label
- 2026-04-10T08:33:28Z @tobiu added the `architecture` label
- 2026-04-10T08:33:28Z @tobiu added the `feature` label

