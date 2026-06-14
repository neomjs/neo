# ADR 0021: Extended-NL multi-writer write enforcement

> How Neo stops two agents that share one App-Worker heap from corrupting each other's Neural Link component writes: a **held-until-release subtree-lock** model keyed on the `(agentId, sessionId)` writer pair, composed from small pure cores plus one stateful heap authority — no parallel write pipeline. This is the **NL component-write** case specifically; multi-writer also arises for multi-tenant push envelopes and `add_memory` JSONL appends, which are separate problems. This record is *why this architecture*, not how to use Neural Link.

| Attribute | Value |
|---|---|
| **Status** | Accepted — the acquire/hold/deny write path is live on `dev` (PR #13226 merged 2026-06-14); the disconnect-release sweep is the open follow-up (#13229) |
| **Author** | @neo-opus-ada (Ada, Claude Opus 4.8) drafting; architecture converged on Epic #13056 + the #13167 contract-of-record |
| **Implementation** | Epic #13056 (Extended-NL coordination); #13167 Leaf B/C contract-of-record; merged leaves #13125 / #13134 / #13138 / #13174 / #13205 / #13208 / #13226 |
| **Decision Record relations** | aligned-with ADR 0020 (Agent Harness — this is the co-habitation write-safety layer of the harness Body); complements the #13167 contract-of-record |
| **Informs** | the disconnect-release follow-up #13229 (`agent_disconnected` → `WriteGuard.releaseAgent`); a future live two-agent whitebox-e2e |
| **Relocates** | `learn/agentos/MultiWriterEnforcement.md` — moved here per @tobiu's #13218 review: this is a maintainer-facing decision record, not a public top-level Learning guide |

---

## 1. Context

This is enforcement for the **co-habitation** case: more than one identified agent issuing write-class Neural Link operations against the same live component tree on one heap. It is not network auth (the Bridge owns that), and it is not the single-writer Fleet-Manager case (#13015 is deliberately single-writer).

Two agents driving the same App-Worker heap can issue overlapping write-class operations (`set_instance_properties`, `call_method`) against the same component subtree. Without coordination, the later write silently clobbers or interleaves with the earlier one — the classic shared-mutable-state corruption, now across *agents* rather than threads. The heap is the shared truth, so the coordination authority must live heap-side, and it must be **held-until-release** (not per-op): a writer holds a subtree while it works, and a *different* writer's overlapping write is denied for as long as the holder keeps it. Per-op locking would not prevent interleaving between two agents' multi-step edits.

## 2. Decision — the lock model

A **lock** is `{agentId, sessionId, subtreePath}`:

- The **writer** is the `(agentId, sessionId)` *pair* — not `agentId` alone. The same human/agent identity on two Bridge connections is two writers; a half-stamped pair (either field missing) is no valid writer at all (fail-closed).
- The **target** is a component **subtree**, named by its absolute root→node component-id path (`subtreePath`). Two locks **conflict** iff their subtrees overlap (one path is a prefix of the other — ancestor/descendant/equal) **and** they belong to *different* writers. Same-writer re-acquisition of an overlapping/identical subtree is re-entrant (granted, no duplicate).
- **Absolute** paths are load-bearing: prefix-overlap is only sound on root→node paths. A relative path would let two unrelated subtrees that share a head id false-overlap (or nested ones false-disjoin).

## 3. The layers

The subsystem is deliberately decomposed into small pure cores plus one stateful authority, so each contract is unit-provable in isolation (no live heap, socket, or `WriteGuard` needed to test the decision logic):

| Layer | Component (`src/ai/`) | Role | Purity / state | Status |
|---|---|---|---|---|
| Conflict math | `LockRegistry` | Stateless overlap/conflict decision over a *caller-held* lock table: `acquire` / `release` / `releaseAll`, `sameWriter` (`(agentId, sessionId)` match), `normalizeLock` (fail-closed on an incomplete pair). | Pure (static, no I/O) | merged (#13125) |
| Heap authority | `WriteGuard` | The *stateful* truth for one App-Worker heap: owns the live held-lock table; `requestWrite(lock) → {granted, conflict, errors}` (acquire **and hold**), `releaseWrite(lock)`, `releaseAgent({agentId, sessionId})` (the disconnect/restart sweep), `heldLocks()`. Delegates the conflict decision to `LockRegistry`. | Stateful, but pure over its inputs (no socket) | merged (#13134) |
| Path derivation | `deriveSubtreePath(componentId, parentOf)` | Turns a live component id into the absolute root→node `subtreePath`. `parentOf` is **injected** (`id => Neo.getComponent(id)?.parentId`). Cycle-guarded; fails closed to `null` on a malformed/cyclic id. | Pure (parentOf injected) | merged (#13138) |
| Transport parse | `parseAgentEnvelope(frame)` | Unwraps an inbound frame → `{jsonrpc, context}`. An `agent_message` sidecar yields `context: {agentId, sessionId}` (both Bridge-stamped); a bare/legacy frame yields `context: null`. Fail-closed `null` per field on a malformed id. | Pure | merged (#13174 / #13205) |
| Decision core | `resolveWriteLock(context, componentId, parentOf)` | The decision between a parsed request and `WriteGuard`: `context` absent → `{enforced:false}` (legacy, unguarded); identity incomplete → deny `incomplete-identity`; target unresolvable → deny `unresolvable-target`; valid → `{enforced:true, lock:{agentId, sessionId, subtreePath}}`. Composes `deriveSubtreePath`. | Pure | merged (#13208) |
| Admission seam | `admitWrite({context, componentId, parentOf, writeGuard})` | Composes `resolveWriteLock` (decision) with `writeGuard.requestWrite` (held-lock acquire) → `{admitted, reason, conflict}`. Fail-closed incl. a `no-write-guard` misconfig branch; deps injected → unit-provable. | Pure (writeGuard injected) | merged (#13226) |
| Write-path wiring | `InstanceService` (`src/ai/client/`) | `setInstanceProperties` / `callMethod` take the threaded `context` and call `admitWrite` **before** mutating: deny → throw, no mutation; legacy (no-context) frame unguarded. The Client (per-heap singleton) owns the heap's `WriteGuard` instance. | Integration | merged (#13226) |

## 4. Request data-flow

```
Bridge (authenticated agent connection, #13181)
  └─ stamps {type:'agent_message', agentId, sessionId, message}   (sidecar emit, #13196/#13199)
       │
   WebSocket frame → Neo.ai.Client.onSocketMessage
       │
   parseAgentEnvelope(frame) ──→ {jsonrpc, context:{agentId, sessionId}}   (or context:null for legacy)
       │
   Client.handleRequest(method, params, context) ──→ service(params, context)
       │                                                  (context threaded; #13174)
   InstanceService.setInstanceProperties / callMethod
       │
   const {admitted, reason, conflict} = admitWrite({context, componentId: id, parentOf, writeGuard})
       ├─ admitted (legacy / granted / same-writer re-entrant) → mutate
       └─ !admitted (incomplete-identity | unresolvable-target | no-write-guard | conflict) → THROW, no mutate
```

## 5. Fail-closed discipline

Every layer fails **closed** — only a fully-valid, identified, non-conflicting request mutates:

- An **absent** `context` is the one fail-*open*-to-legacy path, and it is not an agent-controllable bypass: the Bridge stamps the `agent_message` envelope on every authenticated-agent frame, so a context-less frame at the Client is genuinely non-agent. A present-but-malformed object context **denies** (it is not silently treated as legacy).
- A **half-stamped** `(agentId, sessionId)` pair never acquires a lock (`normalizeLock` / `resolveWriteLock` deny it).
- An **unresolvable** target (malformed/cyclic id → `deriveSubtreePath` returns `null`) denies rather than locking a corrupt path.
- A **missing `writeGuard`** while enforcement is required denies (`no-write-guard`) rather than mutating unguarded.
- A **cross-writer overlap** denies and leaves the held-lock table unchanged; `conflict` is a defensive copy, never a live reference into the authority's state.

## 6. Status & follow-ups

- **Live on `dev`:** the full acquire/hold/deny write path — `LockRegistry` (#13125), `WriteGuard` (#13134), `deriveSubtreePath` (#13138), `parseAgentEnvelope` + `sessionId` (#13174 / #13205), `resolveWriteLock` (#13208), and `admitWrite` + the `InstanceService` write-path enforcement + the Client-owned per-heap `WriteGuard` (#13226).
- **Open follow-up (#13229):** the `agent_disconnected` → `WriteGuard.releaseAgent` sweep that frees a dropped writer's locks (cross-cutting Bridge↔Client; the frame must carry `sessionId`, not just `agentId`). Until it lands, a write's lock is held until heap-restart — same-writer re-acquire is re-entrant (no self-block), a *different* writer is correctly denied. Plus a live two-agent cross-write-denial whitebox-e2e.
- **Out of scope:** the Bridge auth + sidecar transport (the identity Leaf A, already merged) and cross-harness session-id canonicalization (#12984).

## Related

- Epic #13056 (Extended-NL coordination); contract-of-record #13167. Sibling architecture doc: `learn/agentos/HarnessDockZoneModel.md`. Concept anchor: ADR 0020 (Agent Harness).
