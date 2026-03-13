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
updatedAt: '2026-03-12T21:15:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9449'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[x] 9418 Create Data Normalizer Architecture (`Neo.data.normalizer.Base` & `Tree`)'
  - '[x] 9419 Implement Dynamic Module Loading in `Neo.worker.Data`'
  - '[x] 9420 Migrate Data Pipeline to Connection -> Parser -> Normalizer flow'
  - '[x] 9450 Enhance Data Worker to Instantiate Dynamically Loaded Modules'
  - '[ ] 9451 Create Pipeline Cornerstone and Refactor Store Implementation'
  - '[ ] 9452 Connection Foundation and Parser Refactoring'
  - '[ ] 9453 Implement Pipeline IPC and Remote Execution Routing'
  - '[ ] 9454 Implement Push-Based WebSocket Integration in Data Pipeline'
  - '[ ] 9455 Integrate RPC API into Pipeline Architecture (Connection.Rpc)'
subIssuesCompleted: 4
subIssuesTotal: 9
blockedBy: []
blocking: []
---
# Epic: Unified Data Pipeline Architecture (Pipeline -> Connection -> Parser -> Normalizer)

### Goal
Modernize the framework's data architecture by implementing a unified, thread-agnostic data pipeline orchestrated by a new cornerstone class: `Neo.data.Pipeline`. This epic resolves the current fragmentation between local data fetching (Fetch/XHR) and the robust RPC API, ensuring all incoming data—whether pulled via REST, returned from an RPC call, or pushed spontaneously via WebSockets—flows through a standardized transformation and ingestion process.

### Context & The Architectural Schism
Currently, Neo.mjs has two competing data layers and architectural leaks:
1.  **The New Pipeline:** A modern, shaping-focused flow (`Connection -> Parser -> Normalizer -> Store`) designed to handle complex datasets (like Tree Grids). However, `parser.Stream` incorrectly handles fetching natively, breaking the single responsibility principle. Furthermore, the `Store` is currently hardcoded to orchestrate remote Data Worker instantiation for its Normalizer.
2.  **The RPC API:** A powerful system that generates typed proxy functions, handles WebSocket multiplexing, and buffers Ajax requests. If a `Store` uses the `api` config (RPC), it completely bypasses any Parsers or Normalizers.

**The Solution:** We must introduce `Neo.data.Pipeline` as an architectural cornerstone. The Store will exclusively aggregate a `Pipeline` instance. The `Pipeline` entirely encapsulates the cross-worker orchestration, and the RPC API becomes just one of several Transport Mechanisms (Connections) the Pipeline can utilize.

---

### The Unified Architecture

**1. The Hierarchy (`Neo.data.Pipeline`)**
The `Store` will no longer manage `api`, `parser`, or `normalizer` logic directly. It will define a `pipeline_` config, which resolves to a `Neo.data.Pipeline` instance via `ClassSystemUtil.beforeSetInstance()`.
- `Store` -> owns -> `Pipeline`
- `Pipeline` -> owns -> `Connection`, `Parser`, `Normalizer`

The Pipeline class provides a standardized CRUD interface (`create`, `read`, `update`, `destroy`). When `store.load()` triggers `pipeline.read()`, the Pipeline handles the transport, receives the raw data, and automatically pipes it through its Parser and Normalizer before yielding the finalized record array to the Store.

**2. Thread-Agnostic Orchestration (The "Remote Pipeline")**
To prevent the App Worker from blocking during heavy operations (like Tree normalizations), the `Pipeline` class absorbs all cross-worker orchestration logic.
- If `workerExecution: 'data'` is set, the App Worker `Pipeline` instance automatically uses `Neo.worker.Data.createInstance` to spawn the actual Connection, Parser, and Normalizer instances exclusively inside the Data Worker (meaning the App Worker Pipeline only holds the configs, not the instances).
- The Store remains blissfully unaware. It just calls `this.pipeline.read()`.
- The App Worker `Pipeline` sends a lightweight IPC message to its Data Worker counterpart, which handles the network, runs the heavy parsing locally, and sends only the finalized array back across the bridge.

**3. Integrating the RPC API (`Connection.Rpc`)**
A new subclass, `Neo.data.connection.Rpc`, will bridge the gap. Instead of a URL, it takes an `api` config. Its `read()` method acts as an adapter: it makes the RPC call and then routes the raw JSON response through the Pipeline's Parser/Normalizer.

**4. The Push-Based WebSocket Paradigm**
Supporting **server-pushed data** via WebSockets is critical.
- If a Pipeline uses a `WebSocket` connection, the backend can spontaneously push new data.
- The `Connection` intercepts this push, treats it as an incoming `read` operation, and pushes the payload through the Parser and Normalizer.
- The `Pipeline` then broadcasts an event back to the `Store` to ingest the updated records, unifying pull and push workflows.

---

### Implementation Phasing

1. **Phase 1: The Pipeline Cornerstone (#9451)**
   - Create `Neo.data.Pipeline` to manage the `workerExecution` state and the aggregation of Connections, Parsers, and Normalizers using `ClassSystemUtil`.
   - Remove remote instantiation logic from `Neo.data.Store`.

2. **Phase 2: Connection Foundation & Refactoring (#9452)**
   - Create `Neo.data.connection.Base`.
   - Extract the `fetch` logic out of `Neo.data.parser.Stream` and into `Neo.data.connection.Fetch` (or a dedicated Stream Connection). A Parser must strictly parse.

3. **Phase 3: IPC & Remote Execution (#9453)**
   - Implement the IPC routing so an App Worker `Pipeline` can remotely execute a Data Worker `Pipeline` instance.
   - Wire the Data Worker message handlers to route `pipeline.read` requests.

4. **Phase 4: RPC & WebSocket Integration (#9454, #9455)**
   - Create `Connection.Rpc` to wrap proxy calls.
   - Implement observable connections for unsolicited WebSocket push messages to flow through the pipeline.

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

