---
id: 9551
title: 'Examples: Implement unified Data Pipeline showcases'
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-03-25T16:37:21Z'
updatedAt: '2026-03-25T19:27:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9551'
author: tobiu
commentsCount: 1
parentIssue: 9449
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-25T19:27:45Z'
---
# Examples: Implement unified Data Pipeline showcases

### Goal
Create new working examples in the `examples/data/` folder to demonstrate the unified Data Pipeline architecture.

### Description
Since the data architecture has been overhauled to use a `Pipeline -> Connection -> Parser -> Normalizer` flow, we need to provide concrete, working examples for developers.

These examples should showcase:
1.  **App Worker Pipeline:** An example using a lightweight Grid driven by an App Worker pipeline.
2.  **Data Worker Pipeline:** An example showing remote execution of a pipeline inside the Data Worker.
3.  **Connection Types:** Examples covering different connection types like `Fetch` and the new `Rpc` connection.
4.  **Data Shaping:** Demonstrations of `Parser` and `Normalizer` configurations.

These examples will serve as a reference for migrating existing stores and implementing new data flows.

## Timeline

- 2026-03-25T16:37:21Z @tobiu assigned to @tobiu
- 2026-03-25T16:37:23Z @tobiu added the `enhancement` label
- 2026-03-25T16:37:23Z @tobiu added the `ai` label
- 2026-03-25T16:37:23Z @tobiu added the `core` label
- 2026-03-25T16:39:28Z @tobiu added parent issue #9449
- 2026-03-25T19:26:21Z @tobiu referenced in commit `e872704` - "feat: Implement folder-scoped dynamic loading for Data Worker pipelines (#9551)"
### @tobiu - 2026-03-25T19:27:08Z

**Input from Gemini 3.1 Pro:**

> ✦ Completed the implementation of the Unified Data Pipeline showcases and framework enhancements.
> 
> ### Summary of Work:
> 1.  **Framework: Folder-Scoped Dynamic Loading**
>     *   Enhanced `Neo.worker.Data` with `loadDataModule({className})`. This method uses strictly scoped dynamic imports (e.g., `../data/connection/${name}.mjs`) to satisfy the "rip apart" strategy, preventing Webpack bundle bloat while allowing the Data Worker to load its own dependencies on demand.
> 2.  **Core: Pipeline IPC Orchestration**
>     *   Updated `Neo.data.Pipeline` to utilize `loadDataModule` during its `initRemoteExecution` phase.
> 3.  **Core: Instance Lookup Stabilization**
>     *   Imported `Neo.manager.Instance` into the Data Worker to allow resolution of instance IDs for IPC calls.
>     *   Refactored `RemoteMethodAccess` to use the `Neo.get(id)` alias for better resilience.
> 4.  **Example: Data Pipeline Showcase**
>     *   Created a new tabbed example in `examples/data/pipeline/` demonstrating both App Worker and Data Worker pipeline execution.
>     *   Registered the example in `docs/examples.json`.
> 
> Verification: Both tabs in the new example are correctly loading data using their respective pipeline execution modes.

- 2026-03-25T19:27:45Z @tobiu closed this issue

