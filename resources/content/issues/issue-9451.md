---
id: 9451
title: Create Pipeline Cornerstone and Refactor Store Implementation
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-03-12T18:22:38Z'
updatedAt: '2026-03-12T21:15:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9451'
author: tobiu
commentsCount: 0
parentIssue: 9449
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Create Pipeline Cornerstone and Refactor Store Implementation

# Create Pipeline Cornerstone and Refactor Store Implementation

### Goal
Establish `Neo.data.Pipeline` as the central orchestrator for data transformation and remote execution, and remove the brittle remote instantiation logic from `Neo.data.Store`.

### Context
Currently, `Neo.data.Store` attempts to directly manage the cross-worker instantiation of its Normalizer (via `afterSetNormalizer`). This is an abstraction leak; a Store should not be hardcoded to `Neo.worker.Data` or manage remote IDs. 

We need a dedicated `Neo.data.Pipeline` class. The Store will aggregate a `Pipeline` using `ClassSystemUtil.beforeSetInstance()`. The Pipeline takes over the responsibility of owning the `Connection`, `Parser`, and `Normalizer`, and importantly, orchestrating whether they run locally in the App Worker or remotely in the Data Worker.

### Acceptance Criteria
- Create `src/data/Pipeline.mjs` extending `Neo.core.Base`.
- Give `Pipeline` the following reactive configs: `workerExecution` (default `'app'`), `connection_`, `parser_`, and `normalizer_`.
- Use `ClassSystemUtil.beforeSetInstance` inside the Pipeline to instantiate these sub-components.
- If `workerExecution: 'data'`, the Pipeline should use `Neo.worker.Data.createInstance` to spawn the actual Connection, Parser, and Normalizer instances exclusively inside the Data Worker (meaning the App Worker Pipeline only holds the configs, not the instances), storing the remote ID.
- Refactor `Neo.data.Store`: Remove `afterSetNormalizer` and `afterSetParser`. Introduce a `pipeline_` config that uses `ClassSystemUtil.beforeSetInstance` to create the Pipeline.
- The Store's `load()` method should delegate to `this.pipeline.read()`.

## Timeline

- 2026-03-12T18:22:40Z @tobiu added the `enhancement` label
- 2026-03-12T18:22:40Z @tobiu added the `ai` label
- 2026-03-12T18:22:40Z @tobiu added the `architecture` label
- 2026-03-12T18:22:40Z @tobiu added the `core` label
- 2026-03-12T18:23:17Z @tobiu added parent issue #9449
- 2026-03-12T18:24:42Z @tobiu cross-referenced by #9449
- 2026-03-12T18:25:16Z @tobiu assigned to @tobiu
- 2026-03-12T21:02:43Z @tobiu changed title from **Create Connection.Base and Establish Connection -> Parser Hierarchy** to **Create Pipeline Cornerstone and Refactor Store Implementation**
- 2026-03-12T21:03:15Z @tobiu cross-referenced by #9453

