---
id: 9848
title: 'feat: Implement Neural Link Transaction/Undo Stack for Agent-Driven UI Mutations'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2026-04-10T08:33:27Z'
updatedAt: '2026-06-14T10:16:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9848'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues:
  - '[ ] 13221 Neural Link mutation undo — Slice-1 (in-memory, single-level)'
  - '[x] 13304 Neural Link redo tool — re-apply the last undone transaction'
  - '[ ] 13306 Neural Link redo Slice-2: e2e proof — undone component restored via redo'
  - '[x] 13326 Neural Link list_transactions — undo-stack audit/history tool'
  - '[x] 13331 feat: Neural Link named-transaction batching — begin_transaction + commit_transaction (undo-stack Slice-2)'
  - '[x] 13335 test(ai): integration — list_transactions reports a named batch (opCount + all labels)'
  - '[x] 13343 feat: Neural Link abort_transaction — discard an open named batch (undo-stack Slice-2 completion)'
subIssuesCompleted: 5
subIssuesTotal: 7
blockedBy:
  - '[x] 9847 feat: Implement `remove_component` Neural Link Tool'
  - '[x] 9846 feat: Implement `create_component` Neural Link Tool'
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
- 2026-05-27T22:16:17Z @tobiu removed the `feature` label
- 2026-06-07T00:06:47Z @neo-gpt cross-referenced by #9847
- 2026-06-12T18:43:11Z @neo-gpt marked this issue as being blocked by #9846
- 2026-06-12T18:43:12Z @neo-gpt marked this issue as being blocked by #9847
- 2026-06-12T18:43:29Z @neo-gpt added the `needs-re-triage` label
### @neo-gpt - 2026-06-12T18:43:41Z

**Input from GPT-5 (Codex Desktop):**

> ● ## Backlog cleanup / topology note — no implementation claim
> 
> V-B-A current-state check:
> 
> - Current `origin/dev` Neural Link tool surface exposes `set_instance_properties` and `call_method`, but no `create_component`, `remove_component`, `undo`, `redo`, `begin_transaction`, `commit_transaction`, or `list_transactions` operations in `ai/mcp/server/neural-link/toolService.mjs` / `openapi.yaml`.
> - #9846 (`create_component`) is open and already marked `needs-re-triage`; its prior intake says the new agent-consumed MCP API needs a Contract Ledger before branch work.
> - #9847 (`remove_component`) is open, marked `needs-re-triage`, and now blocked by #9846 because removal is not standalone without creation/snapshot semantics.
> - This ticket's own first acceptance criterion requires transaction recording for `create_component`, `remove_component`, and `set_instance_properties`, so it cannot be branch-ready while the create/remove primitives are absent and uncontracted.
> 
> Cleanup applied:
> 
> - Added `needs-re-triage` to this ticket.
> - Set native dependencies: **#9848 is blocked by #9846 and #9847**.
> 
> Next valid move is contract/topology clarification first: decide whether #9848 remains a full transaction stack after #9846/#9847 land, or whether a smaller snapshot-only MVP belongs in the lower-level tool tickets. Do not implement the undo stack directly from the current body.

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

- 2026-06-14T10:16:40Z @neo-opus-vega removed the `needs-re-triage` label
- 2026-06-14T12:04:19Z @neo-opus-vega cross-referenced by #13221
- 2026-06-14T12:05:05Z @neo-opus-vega added sub-issue #13221
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
- 2026-06-15T05:05:26Z @neo-opus-vega added sub-issue #13304
- 2026-06-15T05:28:52Z @neo-opus-vega cross-referenced by #13306
- 2026-06-15T05:29:42Z @neo-opus-vega added sub-issue #13306
- 2026-06-15T05:30:03Z @neo-opus-vega cross-referenced by PR #13307
- 2026-06-15T08:28:24Z @tobiu referenced in commit `a6ff423` - "feat(ai): Neural Link redo tool — re-apply the last undone transaction (#13304) (#13307)

Slice-2 redo (single-level), symmetric to Slice-1 undo: undo retains the popped transaction on a per-session redo branch; the new redo tool re-applies its captured forward-ops under live enforcement as the current requester; a new commit clears the redo branch (divergence invalidation). Entirely in-heap + unit/compliance tested (no live bridge); the live create-undo-redo e2e is a bridge-gated follow-up. Child of #9848, refs #13012 Pillar-2."
- 2026-06-15T09:56:22Z @neo-opus-vega cross-referenced by #13326
- 2026-06-15T09:57:05Z @neo-opus-vega added sub-issue #13326
- 2026-06-15T10:03:52Z @neo-opus-vega cross-referenced by PR #13329
- 2026-06-15T10:23:18Z @neo-opus-vega cross-referenced by #13331
- 2026-06-15T10:23:32Z @neo-opus-vega added sub-issue #13331
- 2026-06-15T10:42:18Z @neo-opus-vega cross-referenced by PR #13333
- 2026-06-15T11:10:11Z @tobiu referenced in commit `1839f76` - "feat(ai): Neural Link list_transactions — undo-stack audit/history tool (#13326) (#13329)

Read-only list_transactions NL tool: a non-consuming projection of TransactionService.stackOf to a {committed, redo} audit summary ({txId, status, opCount, labels} per tx). Wired 6 sites mirroring undo/redo (#13257/#13304): openapi /instance/transactions (read tier) + ListTransactionsRequest, toolService serviceMapping, server-side forward, Client dispatch, the in-app method, the OpenApiValidatorCompliance read-tier fixture. Plus the NeuralLink.md doc-row — the #13318 GuideToolParity guard now keeps doc==openapi parity (42=42). 47 unit/compliance specs green incl the new projection test + undo/redo regression. Child of #9848, Pillar-2 of #13012."
- 2026-06-15T11:13:27Z @neo-opus-vega cross-referenced by #13335
- 2026-06-15T11:15:00Z @neo-opus-vega added sub-issue #13335
- 2026-06-15T11:44:14Z @neo-opus-vega referenced in commit `27920b3` - "feat(ai): Neural Link named-transaction batching — begin/commit_transaction (#13331)

Adds begin_transaction + commit_transaction Neural Link write tools to group several agent mutations into one undoable named batch. recordUndo routes an op INTO an open batch (accumulate, no per-op commit) vs auto-wrapping it per-op (the default capture, preserved when no batch is open); a batched tx undoes/redoes as a single unit. Adds TransactionService.openTxId — a clone-free hot-path probe (stackOf deep-copies the whole stack, O(N²) within a batch). The last named-batching piece of the #9848 undo-stack roadmap (Pillar-2 #13012)."
- 2026-06-15T12:03:11Z @tobiu referenced in commit `caca30c` - "feat(ai): Neural Link named-transaction batching — begin/commit_transaction (#13331) (#13333)

* feat(ai): Neural Link named-transaction batching — begin/commit_transaction (#13331)

Adds begin_transaction + commit_transaction Neural Link write tools to group several agent mutations into one undoable named batch. recordUndo routes an op INTO an open batch (accumulate, no per-op commit) vs auto-wrapping it per-op (the default capture, preserved when no batch is open); a batched tx undoes/redoes as a single unit. Adds TransactionService.openTxId — a clone-free hot-path probe (stackOf deep-copies the whole stack, O(N²) within a batch). The last named-batching piece of the #9848 undo-stack roadmap (Pillar-2 #13012).

* test(ai): cover named-batch redo-as-unit (#13331)

Adds the AC4 redo-as-unit case: begin → record two ops → commit → undo → redo asserts both forward ops are re-dispatched in capture order under capture-suppression, the redo branch is consumed, and the restored committed transaction is one multi-op unit. Complements the existing undo-as-unit coverage (gpt #13333 review)."
- 2026-06-15T12:19:41Z @neo-opus-vega cross-referenced by PR #13340
- 2026-06-15T12:55:17Z @neo-opus-vega cross-referenced by #13343
- 2026-06-15T12:56:09Z @neo-opus-vega added sub-issue #13343
- 2026-06-15T13:01:58Z @neo-opus-vega cross-referenced by PR #13345
- 2026-06-15T15:30:45Z @tobiu referenced in commit `c1b8381` - "feat(ai): Neural Link abort_transaction — discard an open named batch (#13343) (#13345)

* feat(ai): Neural Link abort_transaction — discard an open named batch (#13343)

The third batch-lifecycle tool, completing the begin/commit/abort triad (#13331). abort_transaction discards the writer's open named batch via TransactionService.abort (open → aborted, dropped, never undoable) WITHOUT committing; the applied UI mutations remain — it is NOT a UI rollback (that's composable: undo before abort, or a future tool). 6-site wiring + NeuralLink.md doc row + the OpenApiValidatorCompliance write-locked tier/dangerous-read fixtures + abort unit coverage. Completes the #9848 named-batching surface.

* test(ai): cover no-transaction-service fail-closed across the batch tools (#13343)

Adds the no-transaction-service fail-closed assertion gpt flagged for abort_transaction — extended to begin/commit too (identical untested gap; only listTransactions covered it), so the batch triad's fail-closed coverage is uniform across all three reasons (no-writer-identity / no-transaction-service / no-open-transaction)."
- 2026-06-15T17:50:16Z @neo-claude-opus cross-referenced by #13373
- 2026-06-15T18:05:07Z @neo-opus-vega cross-referenced by #13376
- 2026-06-15T19:33:38Z @neo-opus-vega cross-referenced by #13012

