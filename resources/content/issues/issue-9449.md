---
id: 9449
title: 'Epic: Modernize Data Pipeline Architecture (Parser & Normalizer)'
state: OPEN
labels:
  - epic
  - ai
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-03-12T14:20:24Z'
updatedAt: '2026-03-12T19:35:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9449'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[x] 9418 Create Data Normalizer Architecture (`Neo.data.normalizer.Base` & `Tree`)'
  - '[x] 9419 Implement Dynamic Module Loading in `Neo.worker.Data`'
  - '[x] 9420 Migrate Data Pipeline to Connection -> Parser -> Normalizer flow'
  - '[x] 9450 Enhance Data Worker to Instantiate Dynamically Loaded Modules'
  - '[ ] 9451 Create Connection.Base and Establish Connection -> Parser Hierarchy'
  - '[ ] 9452 Implement Thread-Agnostic Execution Mode for Connections'
  - '[ ] 9453 Wire Data Worker Normalizer Execution Pipeline'
subIssuesCompleted: 4
subIssuesTotal: 7
blockedBy: []
blocking: []
---
# Epic: Modernize Data Pipeline Architecture (Parser & Normalizer)

### Goal
Modernize the framework's data pipeline by implementing a strict `Connection -> Parser -> Normalizer -> Store` flow. This epic tracks the architectural shift required to decouple data fetching and shaping from the Store, allowing execution in the most optimal worker thread (Data Worker or App Worker).

### Context
To support complex data structures (like the nested JSON returned for Tree Grids) and heavy streaming, we need dedicated `Connection`, `Parser`, and `Normalizer` classes. 

**The Hierarchy:**
- **Store** owns a **Connection**.
- **Connection** owns a **Parser**.
- **Parser** owns a **Normalizer**.

**Thread Agnosticism:**
The architecture must be thread-agnostic. While heavy tree normalization should run in the Data Worker to keep the App Worker free, streaming a massive dataset (like 50k users) directly into the App Worker shouldn't be forced through the Data Worker bottleneck if no transformation is needed. The `Connection` must dictate where the pipeline executes.

This Epic extracts the underlying architectural data pipeline tasks originally identified during the Tree Grid Epic (#9404) and expands them to fix the abstraction leaks.

---

### ⚠️ Architectural Pivot Required: Reconciling the Data Pipeline with the RPC API

During initial discovery for the Connection -> Parser -> Normalizer pipeline, a massive architectural schism was identified.

We currently have **two competing data layers**:
1.  **The New Pipeline:** Store -> Connection -> Parser -> Normalizer. This is currently being built around raw URLs and local fetch calls.
2.  **The RPC API (src/remotes/Api.mjs & src/manager/rpc/Api.mjs):** A powerful, existing system that parses remotes-api.json, generates typed proxy functions (e.g., Colors.backend.ColorService.read()), tunnels them to the Data Worker, and natively handles WebSocket connections and Ajax request buffering.

**The Current Flaw:**
If a Store uses the api config, it completely bypasses the Parser and Normalizer. The RPC API was designed to return fully shaped JSON directly to the App Worker.

**The Design Trap:**
We must *not* just slap connection, parser, and normalizer configs directly onto the Store. 

**The True Requirement:**
The Store needs **CRUD support** (Create, Read, Update, Delete). The Connection must map these CRUD operations to the underlying transport mechanism (whether that's a RESTful fetch or an RPC method call). 

The RPC API is a powerhouse. It doesn't need to be replaced; it needs to become a *first-class citizen* within the new Data Pipeline architecture. An RPC endpoint should simply be one type of Connection that a Store can utilize, and it should still be able to pipe its results through a Parser and Normalizer if the raw RPC data requires further shaping (e.g., for Tree Grids).

**Next Steps for this Epic:**
Before building Connection.Base (#9451), the team needs to draft a comprehensive architectural blueprint that unifies the CRUD requirements of the Store with the transport capabilities of the RPC API and the shaping capabilities of the Parser/Normalizer pipeline.

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

