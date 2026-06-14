# Multi-Writer Write Enforcement

`@summary` How Neo prevents two agents that share one App-Worker heap from corrupting each other's component writes: a held-until-release subtree-lock model keyed on the `(agentId, sessionId)` writer pair, composed from small pure primitives plus one stateful heap authority — without a parallel write pipeline.

## Scope

This documents the **Extended-NL multi-writer write-enforcement** subsystem (the locking line of #13056): the components, the lock model, the request data-flow, and the fail-closed discipline.

> **STATUS (2026-06-14): the primitives are built; the write path is not yet wired.** The conflict math, the heap authority, the path derivation, the envelope parse, and the enforcement-decision core are merged on `dev` (or approved). The `InstanceService` write-path wiring that actually *consults* them before mutating, and the disconnect-driven lock sweep, are the **pending** leaf (#13167 Leaf B/C). **Until that wiring lands, no write is enforced** — the primitives exist but nothing calls them on the mutation path yet. This document describes the decided design (the #13167 contract-of-record), not a live guarantee.

This is enforcement for the **co-habitation** case: more than one identified agent issuing write-class Neural Link operations against the same live component tree on one heap. It is not network auth (the Bridge owns that), and it is not the single-writer Fleet-Manager case (#13015 is deliberately single-writer).

## The Problem

Two agents driving the same App-Worker heap can issue overlapping write-class operations (`set_instance_properties`, `call_method`) against the same component subtree. Without coordination, the later write silently clobbers or interleaves with the earlier one — the classic shared-mutable-state corruption, now across *agents* rather than threads. The heap is the shared truth, so the coordination authority must live heap-side, and it must be **held-until-release** (not per-op): a writer holds a subtree while it works, and a *different* writer's overlapping write is denied for as long as the holder keeps it. Per-op locking would not prevent interleaving between two agents' multi-step edits.

## The Lock Model

A **lock** is `{agentId, sessionId, subtreePath}`:

- The **writer** is the `(agentId, sessionId)` *pair* — not `agentId` alone. The same human/agent identity on two Bridge connections is two writers; a half-stamped pair (either field missing) is no valid writer at all (fail-closed).
- The **target** is a component **subtree**, named by its absolute root→node component-id path (`subtreePath`). Two locks **conflict** iff their subtrees overlap (one path is a prefix of the other — ancestor/descendant/equal) **and** they belong to *different* writers. Same-writer re-acquisition of an overlapping/identical subtree is re-entrant (granted, no duplicate).
- **Absolute** paths are load-bearing: prefix-overlap is only sound on root→node paths. A relative path would let two unrelated subtrees that share a head id false-overlap (or nested ones false-disjoin).

## The Layers

The subsystem is deliberately decomposed into small pure cores plus one stateful authority, so each contract is unit-provable in isolation (no live heap, socket, or `WriteGuard` needed to test the decision logic):

| Layer | Component (`src/ai/`) | Role | Purity / state | Status |
|---|---|---|---|---|
| Conflict math | `LockRegistry` | Stateless overlap/conflict decision over a *caller-held* lock table: `acquire` / `release` / `releaseAll`, `sameWriter` (`(agentId, sessionId)` match), `normalizeLock` (fail-closed on an incomplete pair). | Pure (static, no I/O) | merged (#13125) |
| Heap authority | `WriteGuard` | The *stateful* truth for one App-Worker heap: owns the live held-lock table; `requestWrite(lock) → {granted, conflict, errors}` (acquire **and hold**), `releaseWrite(lock)`, `releaseAgent({agentId, sessionId})` (the disconnect/restart sweep), `heldLocks()`. Delegates the conflict decision to `LockRegistry`. | Stateful, but pure over its inputs (no socket) | merged (#13134) |
| Path derivation | `deriveSubtreePath(componentId, parentOf)` | Turns a live component id into the absolute root→node `subtreePath`. `parentOf` is **injected** (`id => Neo.getComponent(id)?.parentId`). Cycle-guarded; fails closed to `null` on a malformed/cyclic id. | Pure (parentOf injected) | merged (#13138) |
| Transport parse | `parseAgentEnvelope(frame)` | Unwraps an inbound frame → `{jsonrpc, context}`. An `agent_message` sidecar yields `context: {agentId, sessionId}` (both Bridge-stamped); a bare/legacy frame yields `context: null`. Fail-closed `null` per field on a malformed id. | Pure | base merged (#13174); `sessionId` thread approved-pending (#13205) |
| Decision core | `resolveWriteLock(context, componentId, parentOf)` | The decision between a parsed request and `WriteGuard`: `context` absent → `{enforced:false}` (legacy, unguarded); identity incomplete → deny `incomplete-identity`; target unresolvable → deny `unresolvable-target`; valid → `{enforced:true, lock:{agentId, sessionId, subtreePath}}`. Composes `deriveSubtreePath`. | Pure | approved (#13207 / PR #13208) |
| Write-path wiring | `InstanceService` (`src/ai/client/`) | **Pending.** `setInstanceProperties` / `callMethod` call `resolveWriteLock` then `WriteGuard.requestWrite` **before** mutating; deny-no-mutate on a conflict; the `agent_disconnected` frame drives `WriteGuard.releaseAgent`. | Integration | **pending (#13167 Leaf B/C)** |

## Request Data-Flow

```
Bridge (authenticated agent connection, #13181)
  └─ stamps {type:'agent_message', agentId, sessionId, message}   (sidecar emit, #13196/#13199)
       │
   WebSocket frame → Neo.ai.Client.onSocketMessage
       │
   parseAgentEnvelope(frame) ──→ {jsonrpc, context:{agentId, sessionId}}   (or context:null for legacy)
       │
   Client.handleRequest(method, params, context) ──→ service(params, context)
       │                                                  (context already threaded; #13174)
   InstanceService.setInstanceProperties / callMethod          ◀── the PENDING wiring
       │
   const d = resolveWriteLock(context, id, parentOf)
       ├─ d.enforced === false        → mutate (legacy / non-agent, unguarded)
       ├─ d.lock === null             → DENY, no mutate (incomplete-identity | unresolvable-target)
       └─ WriteGuard.requestWrite(d.lock)
            ├─ granted → mutate (the lock is now held until release)
            └─ denied  → DENY, no mutate (a different writer holds an overlapping subtree)
```

## Fail-Closed Discipline

Every layer fails **closed** — only a fully-valid, identified, non-conflicting request mutates:

- An **absent** `context` is the one fail-*open*-to-legacy path, and it is not an agent-controllable bypass: the Bridge stamps the `agent_message` envelope on every authenticated-agent frame, so a context-less frame at the Client is genuinely non-agent. A present-but-malformed object context **denies** (it is not silently treated as legacy).
- A **half-stamped** `(agentId, sessionId)` pair never acquires a lock (`normalizeLock` / `resolveWriteLock` deny it).
- An **unresolvable** target (malformed/cyclic id → `deriveSubtreePath` returns `null`) denies rather than locking a corrupt path.
- A **cross-writer overlap** denies and leaves the held-lock table unchanged; `conflict` is a defensive copy, never a live reference into the authority's state.

## Status & Pending Work

- **Merged on `dev`:** `LockRegistry`, `WriteGuard`, `deriveSubtreePath`, `parseAgentEnvelope` (base).
- **Approved, pending merge:** the `parseAgentEnvelope` `sessionId` thread (#13205) and `resolveWriteLock` (#13208).
- **Pending (#13167 Leaf B/C):** the `InstanceService` write-path wiring that consumes `resolveWriteLock` + `WriteGuard.requestWrite` before mutating, and the `agent_disconnected` → `WriteGuard.releaseAgent` sweep that frees a dropped writer's locks. The umbrella closes on those plus a live two-agent cross-write-denial integration proof.
- **Out of scope here:** the Bridge auth + sidecar transport (the identity Leaf A, already merged) and cross-harness session-id canonicalization (#12984).

## Related

- Epic #13056 (Extended-NL coordination); contract-of-record #13167. Sibling architecture doc: `learn/agentos/HarnessDockZoneModel.md`. Concept: ADR 0020 (Agent Harness).
