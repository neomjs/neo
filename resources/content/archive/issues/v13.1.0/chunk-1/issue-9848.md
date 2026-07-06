---
id: 9848
title: 'feat: Implement Neural Link Transaction/Undo Stack for Agent-Driven UI Mutations'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2026-04-10T08:33:27Z'
updatedAt: '2026-07-06T13:19:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9848'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues:
  - '[x] 13221 Neural Link mutation undo — Slice-1 (in-memory, single-level)'
  - '[x] 13304 Neural Link redo tool — re-apply the last undone transaction'
  - '[x] 13306 Neural Link redo Slice-2: e2e proof — undone component restored via redo'
  - '[x] 13326 Neural Link list_transactions — undo-stack audit/history tool'
  - '[x] 13331 feat: Neural Link named-transaction batching — begin_transaction + commit_transaction (undo-stack Slice-2)'
  - '[x] 13335 test(ai): integration — list_transactions reports a named batch (opCount + all labels)'
  - '[x] 13343 feat: Neural Link abort_transaction — discard an open named batch (undo-stack Slice-2 completion)'
subIssuesCompleted: 7
subIssuesTotal: 7
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy:
  - '[x] 9847 feat: Implement `remove_component` Neural Link Tool'
  - '[x] 9846 feat: Implement `create_component` Neural Link Tool'
blocking: []
closedAt: '2026-06-21T19:29:49Z'
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
- 2026-05-27T22:16:17Z @tobiu removed the `feature` label
- 2026-06-07T00:06:47Z @neo-gpt cross-referenced by #9847
- 2026-06-14T05:04:41Z @neo-opus-vega cross-referenced by #13186
- 2026-06-14T05:07:01Z @neo-opus-vega cross-referenced by PR #13188
- 2026-06-14T08:13:25Z @neo-opus-vega cross-referenced by PR #13201
### @neo-opus-vega - 2026-06-14T10:16:05Z

**Input from Claude Opus 4.8 (Claude Code):**

> ❋ **Re-triage (V-B-A, 2026-06-14)** — picking this up against current reality, having just shipped the mutation primitives it builds on.
> 
> **Status: not built; now timely.** The foundation this ticket names is in place — `create_component` (#9846), `remove_component` (#9847), and `set_instance_properties` all ship. `RecorderService` already persists every NL invocation to `nl_action_log` (forward audit for DreamService/RLAIF) — but that is a **forward-only** log: it records `{tool, args, result}`, never reverse-ops, so it is **not** an undo substrate. Concretely, `remove_component`'s forward args are just `{componentId}`; the destroyed config needed to reverse it is never captured.
> 
> **Why this needs design convergence before a build PR (not a cold-build):** undo is architecturally forked, and getting the shape wrong is expensive rework —
> 1. **Reverse-state capture** — reversing a destructive op needs a pre-image (the config before `remove`, the old values before `set`); the forward log can't supply it. Where is the pre-image captured — per-service-method, or a mutation middleware above `ConnectionService.call`?
> 2. **Transaction-model shape** — the `{id, name, operations:[{forward, reverse}], status}` record, where the stack lives (per-session keyed), and atomic/named batching.
> 3. **Sync vs persisted** — in-memory per-session stack vs Memory-Core-persisted (the `RecorderService` precedent) for cross-session replay.
> 
> **Proposed decomposition** (one-PR leaves; `Refs #13012` Pillar-2 — conversational app creation):
> - **Slice 0 — design convergence (Ideation):** the transaction-model shape + reverse-capture hook + sync-vs-persist. It introduces a new stateful NL subsystem → high-blast, so it converges before code.
> - **Slice 1:** in-memory, per-session, single-level `undo` over the 3 known mutations (reverse-capture + the `undo` tool).
> - **Slice 2:** `redo` + named/atomic transactions (batching).
> - **Slice 3:** Memory-Core persistence + cross-session replay.
> - Orthogonal cheap add: a `get_mutation_history` read-tool over the existing `RecorderService` audit log — covers the "audit what an agent changed + when" goal with no transaction model.
> 
> Removing `needs-re-triage`; the triage is done. Next step is the Slice-0 convergence, which I'll drive.

- 2026-06-14T12:04:19Z @neo-opus-vega cross-referenced by #13221
- 2026-06-14T13:04:32Z @neo-opus-vega cross-referenced by #13230
- 2026-06-14T13:12:07Z @neo-opus-vega cross-referenced by PR #13231
- 2026-06-14T17:37:43Z @neo-opus-vega cross-referenced by #13248
- 2026-06-14T17:39:13Z @neo-opus-vega cross-referenced by PR #13249
- 2026-06-14T19:14:23Z @neo-opus-vega cross-referenced by #13257
- 2026-06-14T19:32:02Z @neo-opus-vega cross-referenced by PR #13259
- 2026-06-14T20:19:46Z @neo-opus-vega cross-referenced by #13261
- 2026-06-14T20:30:40Z @neo-opus-vega cross-referenced by PR #13264
- 2026-06-14T23:19:04Z @neo-opus-vega cross-referenced by #13272
- 2026-06-14T23:31:14Z @neo-opus-vega cross-referenced by PR #13274
- 2026-06-15T05:04:58Z @neo-opus-vega cross-referenced by #13304
- 2026-06-15T05:28:52Z @neo-opus-vega cross-referenced by #13306
- 2026-06-15T05:30:03Z @neo-opus-vega cross-referenced by PR #13307
- 2026-06-15T09:56:22Z @neo-opus-vega cross-referenced by #13326
- 2026-06-15T10:03:52Z @neo-opus-vega cross-referenced by PR #13329
- 2026-06-15T10:23:18Z @neo-opus-vega cross-referenced by #13331
- 2026-06-15T10:42:18Z @neo-opus-vega cross-referenced by PR #13333
- 2026-06-15T11:13:27Z @neo-opus-vega cross-referenced by #13335
- 2026-06-15T12:19:41Z @neo-opus-vega cross-referenced by PR #13340
- 2026-06-15T12:55:17Z @neo-opus-vega cross-referenced by #13343
- 2026-06-15T13:01:58Z @neo-opus-vega cross-referenced by PR #13345
- 2026-06-15T17:50:16Z @neo-opus-grace cross-referenced by #13373
- 2026-06-15T18:05:07Z @neo-opus-vega cross-referenced by #13376
- 2026-06-15T19:33:38Z @neo-opus-vega cross-referenced by #13012
- 2026-06-16T03:48:29Z @neo-opus-vega cross-referenced by #13412
- 2026-06-16T08:38:01Z @neo-gpt cross-referenced by PR #13414
### @neo-gpt - 2026-06-21T19:29:48Z

## Intake closeout — already resolved by landed slice PRs

[ARCH_ALIGNMENT] Classification: `already-resolved` for the original #9848 mandatory AC set.

Live V-B-A checked before closing:

- Current source exposes the in-heap `src/ai/TransactionService.mjs` authority plus Neural Link `undo`, `redo`, `list_transactions`, `begin_transaction`, `commit_transaction`, and `abort_transaction` wiring in `src/ai/client/InstanceService.mjs`, `ai/services/neural-link/InstanceService.mjs`, and `ai/mcp/server/neural-link/toolService.mjs`.
- Transaction recording for the three original mutation classes shipped through the Slice-1 leaves: set capture #13249, create capture #13264, remove capture #13274, undo tool #13259, core TransactionService #13231, lifecycle sweep #13284, and AC10 live proof #13286.
- `redo` shipped through #13304 / PR #13307, with the live create -> undo -> redo proof and redo defect fix closed by #13306 / PR #13414.
- Named grouping shipped through #13331 / PR #13333, `list_transactions` through #13326 / PR #13329, batch-list integration through #13335 / PR #13340, and abort through #13343 / PR #13345.

Mapping to #9848 ACs:

- Transaction recording for `create_component`, `remove_component`, `set_instance_properties`: delivered.
- `undo` and `redo` tools functional: delivered and live-proven.
- Named transaction grouping via `begin_transaction` / `commit_transaction`: delivered.
- E2E create -> undo -> verify removed -> redo -> verify restored: delivered via the landed Neural Link create-instance/redo proof path.

Residual boundary: the original body mentioned Memory Core persistence / cross-session continuity as optional/future scope, not as a mandatory AC. That should not keep this broad umbrella open as a stale claimable lane. If persisted transaction history is still wanted, file a fresh narrow Slice-3 leaf with its own Contract Ledger and persistence/security review.

Closing #9848 as completed to remove stale backlog noise.

- 2026-07-05T10:26:10Z @neo-opus-vega cross-referenced by PR #14836

