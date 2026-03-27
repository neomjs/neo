---
id: 9449
title: 'Epic: Unified Data Pipeline Architecture (Pipeline -> Connection -> Parser -> Normalizer)'
state: OPEN
labels:
  - epic
  - ai
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-03-12T14:20:24Z'
updatedAt: '2026-03-17T17:47:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9449'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues:
  - '[x] 9418 Create Data Normalizer Architecture (`Neo.data.normalizer.Base` & `Tree`)'
  - '[x] 9419 Implement Dynamic Module Loading in `Neo.worker.Data`'
  - '[x] 9420 Migrate Data Pipeline to Connection -> Parser -> Normalizer flow'
  - '[x] 9450 Enhance Data Worker to Instantiate Dynamically Loaded Modules'
  - '[x] 9451 Create Pipeline Cornerstone and Refactor Store Implementation'
  - '[x] 9452 Connection Foundation and Parser Refactoring'
  - '[x] 9453 Implement Pipeline IPC and Remote Execution Routing'
  - '[x] 9454 Implement Push-Based WebSocket Integration in Data Pipeline'
  - '[x] 9455 Integrate RPC API into Pipeline Architecture (Connection.Rpc)'
  - '[x] 9502 Migrate existing Stores to the new Pipeline architecture'
  - '[x] 9543 Store Pipeline Instantiation and Legacy Parser Compatibility'
  - '[x] 9544 Enhance RemoteMethodAccess to Support Instance-to-Instance Routing'
  - '[x] 9546 Refactor Pipeline IPC to use Declarative Remote Configs (Instance Proxies)'
  - '[x] 9547 Fix RemoteMethodAccess for Main Thread Addons and Instance-to-Instance ID collision'
  - '[x] 9550 Refactor(data): Implement Store-to-Pipeline Legacy Bridge'
  - '[x] 9551 Examples: Implement unified Data Pipeline showcases'
  - '[x] 9552 Docs: Create Learning Guide for the Unified Data Pipeline Architecture'
  - '[x] 9564 Finalize Data Pipeline Push Integration & UI Reactivity'
subIssuesCompleted: 18
subIssuesTotal: 18
blockedBy: []
blocking: []
---
# Epic: Unified Data Pipeline Architecture (Pipeline -> Connection -> Parser -> Normalizer)

### Goal
Modernize the framework's data architecture by implementing a unified, thread-agnostic data pipeline orchestrated by a new cornerstone class: `Neo.data.Pipeline`. This epic resolves the fragmentation between local data fetching (Fetch/XHR) and the RPC API, ensuring all incoming data—whether pulled via REST, returned from an RPC call, or pushed spontaneously via WebSockets—flows through a standardized transformation and ingestion process.

### Context & The Architectural Schism
Currently, Neo.mjs has two competing data layers:
1.  **The New Pipeline:** A modern, shaping-focused flow (`Connection -> Parser -> Normalizer -> Store`) designed to handle complex datasets (like Tree Grids). However, `parser.Stream` incorrectly handles fetching natively, breaking the single responsibility principle. Furthermore, the `Store` is currently hardcoded to orchestrate remote Data Worker instantiation for its Normalizer.
2.  **The RPC API:** A powerful system that generates typed proxy functions, handles WebSocket multiplexing, and buffers Ajax requests. If a `Store` uses the `api` config (RPC), it bypasses any Parsers or Normalizers.

**The Solution:** Introduce `Neo.data.Pipeline` as an architectural cornerstone. The Store will exclusively aggregate a `Pipeline` instance. The `Pipeline` encapsulates the cross-worker orchestration, and the RPC API becomes a Transport Mechanism (`Connection.Rpc`).

---

### The "Merged Universe": RPC + Pipelines

Data shaping (Parsers and Normalizers) should not be exclusive to Stores. A `ViewController` making a direct RPC call shouldn't have to manually format raw JSON. We are merging these concepts:
- `remotes-api.json` configurations will be enhanced to optionally define `parser` and `normalizer` configs for specific endpoints.
- When `Neo.remotes.Api` detects these configs, the generated proxy function will automatically pipe the raw JSON response through a Pipeline inside the Data Worker before returning the perfectly shaped data to the App Worker.

### Progressive Hydration & Delta-Aware Pipelines

Modern applications require high Time-To-Interactive (TTI). A common backend pattern is to push "Quick Wins" (lightweight data like IDs and titles) immediately, and then stream the heavy, processed fields (like complex summaries or aggregations) later via WebSockets as Operational Transforms (Opcodes / Deltas).

To support this natively:
1.  **Pipelines are Delta-Aware:** They are not just for `read()` (Full Loads). They must support continuous stream handlers that output *partial* record updates.
2.  **The Parser's Dual Role:** For a `read()`, the Parser shapes a bulk array. For a `stream`, a specialized Parser translates proprietary backend Opcodes into standardized Neo.mjs Deltas (Insert, Update, Delete).
3.  **Surgical Updates:** When a Store receives a parsed Delta from the Pipeline, it uses `record.set({ field: 'new value' })`. The `RecordFactory` increments the record version, and the VDOM Worker calculates a minimal patch, updating just a single grid cell without replacing the whole row or losing local UI state.

---

### Implementation Phasing

1. **Phase 1: The Pipeline Cornerstone (#9451)**
   - Create `Neo.data.Pipeline` to manage `workerExecution` state.
   - Refactor `Store` to delegate to `this.pipeline.read()`.

2. **Phase 2: Connection Foundation & Refactoring (#9452)**
   - Extract fetch logic out of `Neo.data.parser.Stream` into Connections.

3. **Phase 3: IPC & Remote Execution (#9453)**
   - Implement the IPC routing so an App Worker Pipeline can remotely execute a Data Worker Pipeline instance.

4. **Phase 4: RPC Integration & The Merged Universe (#9455)**
   - Create `Connection.Rpc` to wrap proxy calls.
   - Enhance `Neo.remotes.Api` to support pipelines for standalone RPC calls.

5. **Phase 5: Push-Based WebSocket Integration (#9454)**
   - Introduce `streams` to `remotes-api.json`.
   - Implement persistent stream subscriptions in `manager.rpc.Message`.
   - Support "Delta" routing from Connections through Parsers directly to Stores or ViewControllers.

## Timeline

- 2026-03-12T14:20:26Z @tobiu added the `epic` label
- 2026-03-12T14:20:26Z @tobiu added the `ai` label
- 2026-03-12T14:20:26Z @tobiu added the `architecture` label
- 2026-03-12T14:20:26Z @tobiu added the `core` label
- 2026-03-12T14:21:15Z @tobiu added sub-issue #9418
- 2026-03-12T14:21:18Z @tobiu added sub-issue #9419
- 2026-03-12T14:21:22Z @tobiu added sub-issue #9420
- 2026-03-12T14:23:39Z @tobiu assigned to @tobiu
- 2026-03-12T15:04:58Z @tobiu added sub-issue #9450
- 2026-03-12T18:23:17Z @tobiu added sub-issue #9451
- 2026-03-12T18:23:23Z @tobiu added sub-issue #9452
- 2026-03-12T18:23:25Z @tobiu added sub-issue #9453
- 2026-03-12T20:16:19Z @tobiu cross-referenced by #9454
- 2026-03-12T20:18:45Z @tobiu added sub-issue #9454
- 2026-03-12T21:03:41Z @tobiu changed title from **Epic: Modernize Data Pipeline Architecture (Parser & Normalizer)** to **Epic: Unified Data Pipeline Architecture (Pipeline -> Connection -> Parser -> Normalizer)**
- 2026-03-12T21:04:08Z @tobiu added sub-issue #9455
- 2026-03-12T21:14:31Z @tobiu cross-referenced by #9451
### @tobiu - 2026-03-17T17:14:28Z

**Input from Gemini 3.1 Pro:**

> ✦ ### 🤖 AI Agent / Developer Briefing: Architectural Guidelines for Implementation
> 
> Before beginning work on any phase of this Epic, it is critical to understand the nuanced architecture of the Neo.mjs data layer to avoid significant design flaws. This Epic merges the Pipeline architecture with the RPC/WebSocket architecture.
> 
> **1. Critical Trap: Records vs. Models**
> *   **The Trap:** Assuming that `Neo.data.Store` items are instances of `Neo.data.Model`. They are **NOT**.
> *   **The Reality:** The Store uses `Neo.data.RecordFactory` to create lightweight, enhanced objects (Records) that map back to a Model definition, but they are not Model instances themselves. 
> *   **Architectural Implication:** Never attempt to bind a WebSocket subscription directly to a Record instance or a Model. Subscriptions belong to the `Pipeline` or are initiated by a `ViewController` via `Neo.remotes.Api`. The Pipeline parses the incoming push into a delta, and the Store executes `record.set(delta)` on the lightweight object, triggering a surgical VDOM update.
> 
> **2. The Pipeline Boundary (App Worker vs. Data Worker)**
> *   The `Neo.data.Pipeline` class is primarily an **App Worker** construct.
> *   When `workerExecution: 'data'` is used, the App Worker Pipeline acts as an orchestrator. It holds the configs but uses IPC to instruct the Data Worker to instantiate the *actual* `Connection`, `Parser`, and `Normalizer`.
> *   An App Worker Pipeline cannot natively "listen" to events from a Data Worker Connection. All cross-worker communication for streams and data fetching must explicitly bridge via IPC (`Neo.worker.Data` message handlers).
> 
> **3. Key Files & Subsystems Affected:**
> To successfully implement this Epic, you must be familiar with the following files:
> *   **The Data/Store Layer:**
>     *   `src/data/Store.mjs` (Understand `add()`, `recordChange`, and `autoInitRecords`)
>     *   `src/data/RecordFactory.mjs` (Understand how `set()` updates a record and increments `versionSymbol`)
> *   **The RPC/Remotes Layer:**
>     *   `src/remotes/Api.mjs` (Where `remotes-api.json` is parsed and proxy functions are generated. This needs to wrap proxies in Pipelines).
>     *   `src/manager/rpc/Api.mjs` & `src/manager/rpc/Message.mjs` (Needs enhancement for persistent `callbackId` subscriptions instead of just single-use Promise `mId`s).
> *   **The Connection Layer:**
>     *   `src/data/connection/WebSocket.mjs` (Needs enhancement to route unsolicited pushes to subscribed channels/pipelines).
> 
> **4. The "Progressive Hydration" Testing Standard:**
> When implementing Parsers for streams (#9454), tests should explicitly prove that a pushed Delta (e.g., `{ action: 'update', id: 1, changes: { heavyField: 'data' } }`) routes through the Pipeline and correctly triggers `record.set()` in the Store without causing a full collection reset.

- 2026-03-17T17:46:52Z @tobiu added sub-issue #9502
### @tobiu - 2026-03-17T17:47:37Z

**Input from Gemini 3.1 Pro:**

> ✦ Added sub-issue #9502 for **Phase 6: Migration & Regression Testing**.
> 
> This phase focuses on scanning the `examples` and `apps` folders for any `Store` instances currently using direct `api` or `url` configs. We need to ensure these are systematically migrated to the new `pipeline` architecture to prevent any regression bugs as the old patterns are phased out.

- 2026-03-17T18:48:48Z @tobiu cross-referenced by PR #9501
- 2026-03-24T16:08:31Z @tobiu added sub-issue #9543
- 2026-03-24T19:31:36Z @tobiu cross-referenced by #9544
- 2026-03-24T19:31:49Z @tobiu added sub-issue #9544
- 2026-03-24T20:20:11Z @tobiu added sub-issue #9546
- 2026-03-24T21:19:35Z @tobiu added sub-issue #9547
- 2026-03-25T15:24:16Z @tobiu added sub-issue #9550
- 2026-03-25T16:39:28Z @tobiu added sub-issue #9551
- 2026-03-25T16:40:36Z @tobiu added sub-issue #9552
- 2026-03-26T16:14:06Z @tobiu added sub-issue #9564

