# ADR 0001: Cross-Process Cache Coherence for Memory Core Graph

> Architectural Decision Record for Epic #10186. Evaluates shared caching
> substrates to eliminate `GraphService` singleton-cache divergence across
> concurrent MCP server processes (Claude Desktop / Claude Code / Antigravity).

| Attribute | Value |
|---|---|
| **Status** | Proposed — 2026-04-22 |
| **Author** | Claude Opus 4.7 (Claude Code) |
| **Resolves** | #10189 |
| **Unblocks** | #10190 |
| **Parent Epic** | #10186 |
| **Informs** | #10184 (symptom this substrate class causes), #10185 (within-process band-aid already merged) |

---

## 1. Context

`Neo.ai.services.memory-core.GraphService` is declared `singleton: true`
and holds the in-memory projection of the graph (`db.nodes` Map, `db.edges` Store,
`vicinityLoadedNodes` Set). Every MCP server process has its own singleton;
processes share only the SQLite-WAL backing file at
`.neo-ai-data/sqlite/memory-core-graph.sqlite`.

The empirical diagnostic from PR #10197 (`diagnoseMcpConcurrency.mjs`) confirms up
to 4 concurrent Node processes touching the same SQLite file under typical
multi-harness operation (2 × Claude Desktop + 2 × Antigravity with Twin Language
Server doubling). Under #10186's worst-case estimate, concurrent-process count
reaches ~20 when all harnesses × worktrees are active.

SQLite WAL handles storage concurrency correctly. The observed failure (`#10184`:
`bindAgentIdentity` null at boot despite a populated SQLite row) is a **cache-layer
divergence** — Process B's in-memory cache doesn't see what Process A wrote to
storage. PR #10185's retry-with-vicinity-delete closed the boot-time symptom but
does not address the underlying class of bug.

This ADR evaluates substrate options for the shared-cache-coherence layer that
would close the bug class systemically.

---

## 2. Existing Substrate Audit (Critical Finding)

**The codebase already implements a cross-process cache-coherence primitive.**
This ADR's solution space is reshaped by this discovery; rejecting the "invent new
substrate" framing is the single most important architectural decision.

### 2.1 The `GraphLog` Write-Ahead Change Log

`ai/graph/storage/SQLite.mjs` lines 95–110 declare:

```sql
CREATE TABLE IF NOT EXISTS GraphLog (
    log_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id   TEXT,
    entity_type TEXT,
    -- ...
);

-- Triggers on Nodes and Edges tables:
CREATE TRIGGER node_insert AFTER INSERT ON Nodes
    BEGIN INSERT INTO GraphLog(entity_id, entity_type) VALUES (NEW.id, 'nodes'); END;
-- (equivalent update / delete triggers for nodes and edges)
```

Every mutation to `Nodes` or `Edges` — regardless of which process authored it —
appends a durable record to `GraphLog`. Because `GraphLog` lives in the shared
SQLite file, all processes observe the same sequence.

### 2.2 The `syncCache()` Delta Replay

`ai/graph/Database.mjs` line 77 implements delta-log replay:

```javascript
syncCache() {
    if (!this.storage || !this.lastSyncId) return;     // ← bug (see §2.4)
    let delta       = this.storage.getDeltaLog(this.lastSyncId);
    this.lastSyncId = delta.lastLogId;

    if (delta.invalidNodes.length > 0) {
        this.nodes.remove(delta.invalidNodes);
        delta.invalidNodes.forEach(id => {
            this.vicinityLoadedNodes.delete(id);
            this.lastAccessMap.delete(id);
        });
    }
    if (delta.invalidEdges.length > 0) {
        this.edges.remove(delta.invalidEdges);
    }
}
```

`syncCache()` is called at the start of every `getAdjacentNodes(nodeId)` call
(`Database.mjs:260`). Its contract: "pull any mutations since our last sync,
invalidate the corresponding cache entries so the subsequent lazy-load picks up
the fresh state."

### 2.3 The `lastSyncId` Watermark

`Database.mjs:43` declares `lastSyncId: 0` as the initial state. `storage.load()`
(`SQLite.mjs:335–343`) advances it to the current `MAX(log_id)` at boot so the
process starts tracking only mutations *after* its load completes. Local writes
bump the watermark via `acknowledgeLocalMutations()` (`Database.mjs:117`) so a
process doesn't re-process its own writes as external changes.

### 2.4 Why the primitive isn't preventing `#10184`

Reading `syncCache()`'s guard: `if (!this.storage || !this.lastSyncId) return;`.
The `!this.lastSyncId` clause early-exits when `lastSyncId === 0` — which happens
when the DB has never recorded a mutation *at the moment `storage.load()` ran*.

Concrete race (matches `#10184` empirically):

1. Claude Desktop boots Process B at T₀. `GraphLog` is empty: `MAX(log_id) = 0`.
2. `storage.load()` sets `lastSyncId = 0`.
3. At T₁, another process (or a one-shot seed script like `seedAgentIdentities.mjs`)
   writes `@neo-opus-4-7` to `Nodes`. Trigger fires: `GraphLog.log_id = 1`.
4. At T₂, Process B calls `bindAgentIdentity('neo-opus-4-7')`:
   - `getAdjacentNodes('@neo-opus-4-7')` triggers `syncCache()`
   - `!this.lastSyncId` is truthy (0 is falsy) → **early return, no delta replay**
   - `vicinityLoadedNodes.has('@neo-opus-4-7')` is false → `loadNodeVicinitySync` runs
   - *Depending on SQLite WAL visibility at T₂*, the query may or may not see the T₁ write
   - If the query sees empty vicinity: `vicinityLoadedNodes.add(id)` marks loaded (this is the #10181 mark-without-load bug)
   - If it sees the node: we're fine
5. After T₂, Process B's cache is permanently stuck on whatever outcome T₂ produced,
   because the **next** `syncCache()` still short-circuits (lastSyncId still 0
   until Process B itself writes something).

Two interlocking bugs produce the observed symptom:

- **Bug A** (syncCache early-return): prevents the delta-replay substrate from
  running on a fresh-boot process until it makes its first local write
- **Bug B** (mark-without-load, `Database.mjs:281`): compounds Bug A — once a
  zero-result lazy-load happens, the vicinity cache marks the id "loaded" and
  subsequent `getAdjacentNodes` calls skip re-reading SQLite until something
  explicitly invalidates the entry (which Bug A prevents)

**The substrate exists and is well-designed. Two surgical defects in its
implementation produce the `#10184` failure mode.**

---

## 3. Decision Drivers

- **Correctness:** eliminate cross-process cache divergence deterministically
- **Minimize churn:** reuse existing substrate when available — avoid importing
  standard-backend-framework patterns (Redis pub-sub, ZooKeeper consensus, CRDT
  eventual-consistency) that are **training-data attractors** for this problem
  class but wrong-substrate for a local single-machine MCP swarm (per epic-review
  stage 5 extension opportunity)
- **Testability:** any chosen approach must be empirically verifiable — specifically,
  the A→seed / B→read divergence test from `#10186`'s Verification section
- **Service-boundary discipline:** the fix belongs on the cache layer (`Database.mjs`),
  not scattered across call-sites like `bindAgentIdentity` (which PR #10185 had to
  patch as a band-aid for lack of a substrate fix)
- **Performance:** changes must not regress the hot path (O(1) in-memory reads for
  cached nodes; O(log n) SQLite reads for lazy-load). Any substrate that adds
  network round-trips or process-boundary RPC on every cache read is regressive

---

## 4. Considered Options

### 4.1 Option A — Harden the existing `GraphLog` + `syncCache()` primitive [RECOMMENDED]

**Approach:** Fix Bugs A and B identified in §2.4. Do not introduce new substrate.

Two surgical changes in `ai/graph/Database.mjs`:

1. **Drop the `!this.lastSyncId` early-return clause in `syncCache()`**
   (currently line 78). Rationale: `getDeltaLog(0)` is a legitimate query meaning
   "give me all mutations" — exactly what a process with an unadvanced watermark
   needs. The existing guard is overly conservative and creates the Bug A race.
   Change becomes:
   ```javascript
   syncCache() {
       if (!this.storage) return;
       // lastSyncId === 0 is legitimate — fresh boot wanting full catch-up
       let delta       = this.storage.getDeltaLog(this.lastSyncId);
       this.lastSyncId = delta.lastLogId;
       // ...
   }
   ```

2. **Don't mark `vicinityLoadedNodes` on empty-result lazy load**
   (`Database.mjs:281`, the #10181 root). Rationale: a zero-result query means
   "the data isn't there yet," not "I've loaded nothing and will never check
   again." Marking loaded on empty conflates the two.
   Change becomes:
   ```javascript
   if (vicinity.nodes.length > 0) {
       me.nodes.add(vicinity.nodes);
   }
   if (vicinity.edges.length > 0) {
       me.edges.add(vicinity.edges);
   }
   // Only mark vicinity-loaded when we actually loaded something
   if (vicinity.nodes.length > 0 || vicinity.edges.length > 0) {
       me.vicinityLoadedNodes.add(nodeId);
   }
   ```

**Pros:**
- Zero new substrate; reuses what exists
- `GraphLog` triggers are already firing in production; changes are to the consumer
- Surgical: ~10-line diff across two methods
- Changes are hypothesis-testable via unit tests (mock storage with pre-seeded
  deltas; assert syncCache replays them even when `lastSyncId === 0`)
- No performance regression — drops a truthy check, adds a length check
- Honors service-boundary discipline (cache-layer fix, not call-site patching)

**Cons:**
- Removing the `!lastSyncId` check means `getDeltaLog(0)` may scan the full
  `GraphLog` table on first call for a long-lived DB. Mitigation: `GraphLog` is
  append-only and grows linearly with mutations; a periodic compaction task
  (separate ticket) can cap growth. For current scale (tens of thousands of
  mutations), the full-scan is sub-millisecond.
- Doesn't address the `vicinityLoadedNodes` semantic limitation: the Set doesn't
  track *when* a node was marked loaded, so an entry from T-distant-past stays
  authoritative. Delta-replay invalidates entries on mutations, so this is
  correct in steady state — but a node that has *never* been mutated and never
  existed will be re-queried every call (no "confirmed-absent" caching). For
  identity binding this is the correct behavior (boot-time seeding may happen
  any moment); for other call sites it's a trade-off worth documenting.

### 4.2 Option B — Eliminate the in-memory cache entirely

**Approach:** Remove `db.nodes`/`db.edges` as cache Maps; every `getNode()`
queries SQLite directly.

**Pros:**
- Maximum simplicity: zero divergence possible, no invalidation semantics to
  reason about
- Leverages SQLite WAL's built-in concurrency correctness

**Cons:**
- Every tool dispatch reads SQLite: O(N) queries per session vs current O(1)
  cached reads
- Requires empirical measurement to validate latency budget (not available in
  this ADR's timebox)
- Refactor touches every consumer of `db.nodes`/`db.edges`, not just the race sites
- Removes a legitimate optimization without empirical evidence it's unnecessary

### 4.3 Option C — SQLite-backed shared cache with invalidation log

**Approach:** Store cache-invalidation sequence in SQLite; each process subscribes
to a sequence table and invalidates local entries on advance.

**Verdict: Effectively Option A.** This is precisely what `GraphLog` + `syncCache`
already implement. The only delta from Option A is whether we call the existing
primitive "adequate" or "needs extending." Given Option A's two-bug hypothesis
produces the observed symptom, Option C collapses into Option A at the
implementation level.

### 4.4 Option D — IPC daemon / shared-memory cache [REJECTED]

**Approach:** New long-running daemon process owns the cache; MCP servers talk to
it via Unix socket / named pipe / SharedArrayBuffer.

**Rejection rationale:**
- Introduces a new process lifecycle (startup, crashes, upgrades) — adds
  operational complexity without clear gain
- Creates a single-point-of-failure the current design doesn't have (daemon
  crash → all MCP servers lose their cache, cold restart required)
- IPC round-trips regress the hot path from O(1) memory access to syscall latency
- Wrong-substrate: the problem is "stale cache," not "no source of truth" —
  SQLite is already the SoT, just needs coherent consumers
- Training-data attractor: standard-backend-framework solution (e.g., Redis
  sidecar) transplanted into a domain that doesn't need it

### 4.5 Option E — Chroma vector collection as KV cache [REJECTED]

**Approach:** Use an existing Chroma collection to store cache state accessible
cross-process.

**Rejection rationale:**
- Chroma is a vector DB — using it as plain KV is a **category error**
  (epic-review stage 5 flagged this preemptively)
- Every cache read requires an embedding lookup (even if the "key" is just an
  identity string, Chroma's query path is vector-similarity, not exact-match)
- Network hop to Chroma adds latency no faster than SQLite direct read
- Adds a cross-service dependency (Chroma must be healthy for identity cache to
  work) where none currently exists at that layer

---

## 5. Decision Outcome

**Choose Option A: Harden the existing `GraphLog` + `syncCache()` primitive.**

The underlying substrate is already correct. Two surgical defects in its
implementation produce the `#10184` symptom. Fix the defects in place rather
than layering new substrate on top.

### 5.1 Scope of `#10190`'s implementation

The ADR recommends `#10190` be **re-scoped** from *"Implement chosen shared
caching substrate"* to *"Harden existing `syncCache()` + `vicinityLoadedNodes`
correctness"*. The title's "implement substrate" framing is obsolete under this
decision — no new substrate will be built. The scope becomes:

1. Drop the `!this.lastSyncId` early-return guard in `Database.mjs:78`
2. Only mark `vicinityLoadedNodes.add(nodeId)` when the vicinity query returned
   non-empty results in `Database.mjs:281`
3. Add Playwright regression tests:
   - **Fresh-boot race (Bug A):** mock a DB with pre-existing `GraphLog` entries
     and `lastSyncId = 0`; assert subsequent `syncCache()` call replays them
   - **Mark-without-load (Bug B):** upsert a node, clear `db.nodes`, keep
     `vicinityLoadedNodes` marked; assert that after the fix, subsequent
     `getNode` on an empty-vicinity returns null without sticking the cache
   - **End-to-end divergence:** two Database instances over the same SQLite
     file; Process A writes, Process B reads via `getNode`, assert Process B's
     next read sees Process A's write
4. Remove PR #10185's `bindAgentIdentity` retry-loop band-aid once the
   substrate-layer fix is empirically verified — the retry is hypothesis-1
   specific and becomes redundant
5. Preserve PR #10182's `callTool` self-heal block as defense-in-depth until
   the end-to-end divergence test passes cleanly across at least one live
   restart cycle with all three harnesses active.
   - **Update (2026-04-23):** This condition was empirically verified and the `#10182` block was surgically removed via PR #10227. The architectural rationale shifted from "defense-in-depth" to "surface, don't obscure" — defensive code here masked bugs, whereas explicit failure aligns with Neo.mjs's loud-failure discipline. The `#10228` test-pollution fix further mitigates the remaining failure mode that would have made self-heal useful.

### 5.2 Post-implementation validation

After #10190 lands:

1. Run `diagnoseMcpConcurrency.mjs` pre-restart to confirm multi-process state
2. Full restart of Claude Desktop + Claude Code + Antigravity
3. `list_messages` via memory-core returns populated mailbox (closes `#10184` ACs 5/6)
4. Manual A→seed / B→read verification via two MCP client sessions
5. If any step fails: the substrate fix is incomplete and the band-aids in PR
   #10185 + #10182 remain operative

---

## 6. Positive Consequences

- Closes `#10184`'s underlying bug class, not just the symptom
- Unblocks live A2A handshakes (`#10139` Mailbox epic dependency chain)
- Eliminates the need for the PR #10185 retry band-aid once verified
- Preserves all existing consumer contracts — no API surface changes
- Honors "reuse existing substrate" as a first-class architectural principle
  for this codebase
- Provides a regression-test suite that doubles as documentation of the
  coherence contract

## 7. Negative Consequences / Risks

- **`getDeltaLog(0)` full-scan on first call:** manageable at current scale
  (sub-millisecond on tens of thousands of `GraphLog` rows). Mitigation:
  periodic compaction (separate future ticket) or bound `getDeltaLog` with a
  recency window once the table grows large.
- **Hidden assumption on SQLite WAL visibility timing:** `loadNodeVicinitySync`
  still depends on WAL checkpointing making writes visible to readers. If WAL
  visibility is itself racy, Option A's fixes may be necessary-but-insufficient.
  Mitigation: the divergence test in `#10190` will surface this empirically.
- **`vicinityLoadedNodes` doesn't track confirmed-absent:** after Bug B fix, a
  never-existed node will be re-queried on every `getNode` call. For identity
  binding this is correct (boot-time seeding is timing-sensitive); for
  high-frequency callers it's a micro-regression. Accept as trade-off; measure
  if it surfaces.

## 8. Alternatives Considered and Rejected (Summary)

| Option | Rejection reason |
|---|---|
| B — Drop cache entirely | Unmeasured latency risk; over-refactor for a two-bug fix |
| C — SQLite-backed shared cache | Collapses into Option A (already the existing primitive) |
| D — IPC daemon | New SPOF; wrong-substrate training-data attractor |
| E — Chroma KV | Category error (vector DB as plain KV); epic-review §5 flagged |

## 9. References

### Source code

- `ai/graph/Database.mjs` — `syncCache()`, `lastSyncId`, `vicinityLoadedNodes`
- `ai/graph/storage/SQLite.mjs` — `GraphLog` schema + triggers, `getDeltaLog()`,
  `load()`
- `ai/services/memory-core/GraphService.mjs` — `initAsync()`, `getNode()`

### Related tickets

- **Parent Epic:** #10186 (MCP concurrency audit + single-writer enforcement)
- **Sibling subs:** #10187 (diagnoseMcpConcurrency — merged), #10188
  (boot-time sibling-PID logging — in progress), #10190 (implementation —
  blocked on this ADR)
- **Symptom this ADR addresses:** #10184 (identity-binding null at boot)
- **Band-aid PRs preserved until verified:** #10185 (retry loop), #10182 (self-heal)
- **Test harness dependency:** #10183 (MCP server test harness — useful but
  not blocking)

### Epic-review context

- Epic #10186 five-stage review by Claude Opus 4.7:
  https://github.com/neomjs/neo/issues/10186 (comment anchor)
- Flagged training-data attractors for this problem class (Redis pub-sub,
  ZooKeeper, CRDTs) preempt the Option D/E rejections above

---

## Handoff Retrieval Hints

- `query_raw_memories(query="cross-harness MCP singleton cache divergence GraphLog syncCache")`
- `query_raw_memories(query="vicinityLoadedNodes mark-without-load lastSyncId early-return")`
- `query_summaries(query="MCP concurrency ADR shared caching substrate")`
- Commit-range anchor: PR #10197 (diagnoseMcpConcurrency merged) → this ADR

Known contributing sessions (partial, restart-fragmented):
- `ae546a40-2133-482f-85a6-779fdf6757b2` (authoring session; cross-harness diagnostic + #10187 implementation + #10189 ADR)
- `fe1cd4d0-e667-45cf-bd02-7fb79a13a64f` (PR #10185 review cycles — origin of the band-aid this ADR contextualizes)
