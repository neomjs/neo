---
id: 9453
title: Implement Pipeline IPC and Remote Execution Routing
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-03-12T18:23:01Z'
updatedAt: '2026-03-24T20:12:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9453'
author: tobiu
commentsCount: 1
parentIssue: 9449
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-24T20:12:07Z'
---
# Implement Pipeline IPC and Remote Execution Routing

### Goal
Enable the App Worker's `Pipeline` instance to seamlessly execute its counterpart inside the Data Worker.

### Context
In issue #9451, we created `Neo.data.Pipeline` which handles instantiating a mirror of itself in the Data Worker if `workerExecution: 'data'` is set. However, calling `pipeline.read()` currently does nothing remotely. We need to implement the IPC messaging that triggers the remote execution.

### Acceptance Criteria
- Implement `read()`, `create()`, `update()`, and `destroy()` methods on `Neo.data.Pipeline`.
- When invoked in the App Worker with `workerExecution: 'data'`, these methods must send an IPC message (e.g., `{ action: 'pipeline.execute', id: this.remoteId, operation: 'read', params: ... }`) to the Data Worker.
- Add an `onPipelineExecute` message handler in `src/worker/Data.mjs`.
- This handler must look up the correct Pipeline instance from `this.instances`, invoke the requested operation (which will run the local Connection, Parser, and Normalizer in the Data Worker), and then send the finalized record array back to the App Worker's Promise resolver.

## Timeline

- 2026-03-12T18:23:02Z @tobiu added the `enhancement` label
- 2026-03-12T18:23:03Z @tobiu added the `ai` label
- 2026-03-12T18:23:03Z @tobiu added the `architecture` label
- 2026-03-12T18:23:03Z @tobiu added the `core` label
- 2026-03-12T18:23:25Z @tobiu added parent issue #9449
- 2026-03-12T18:24:42Z @tobiu cross-referenced by #9449
- 2026-03-12T18:25:27Z @tobiu assigned to @tobiu
- 2026-03-12T21:03:14Z @tobiu changed title from **Wire Data Worker Normalizer Execution Pipeline** to **Implement Pipeline IPC and Remote Execution Routing**
- 2026-03-12T21:14:31Z @tobiu cross-referenced by #9451
- 2026-03-24T16:07:42Z @tobiu cross-referenced by #9543
- 2026-03-24T20:09:41Z @tobiu referenced in commit `2b9b44b` - "feat(data): implement Pipeline IPC and remote execution routing (#9453)"
### @tobiu - 2026-03-24T20:09:50Z

**Input from Gemini 3.1 Pro:**

> ✦ I have implemented the Pipeline IPC and remote execution routing, leveraging the new Instance-to-Instance `RemoteMethodAccess` (RMA) layer we built in #9544.
> 
> **Implementation Details:**
> 1.  **Pipeline Operations (`src/data/Pipeline.mjs`):**
>     *   Updated `read()` to use `Neo.currentWorker.generateRemote` to create a proxy to its Data Worker counterpart.
>     *   Implemented `create()` and `update()` methods using a shared `executeRemoteOrLocal` helper. This helper ensures that if `workerExecution: 'data'` is set, all operations are seamlessly routed via RMA to the `remoteId`.
> 2.  **Data Worker Cleanup (`src/worker/Data.mjs`):**
>     *   **Removed the Hack:** Deleted the hardcoded `onPipelineExecute` message handler. The Data Worker no longer needs domain-specific logic to route Pipeline calls; the core RMA mixin handles it automatically via `remoteId`.
>     *   **Memory Management:** Added an `onDestroyInstance` handler. When the App Worker Pipeline is destroyed, it sends a `destroyInstance` message. This new handler ensures the remote instance is properly destroyed (`instance.destroy()`) and removed from the Data Worker's `this.instances` cache, preventing memory leaks.
> 
> The pipeline architecture is now fully wired for cross-worker orchestration. I will close this sub-issue.

- 2026-03-24T20:12:08Z @tobiu closed this issue
- 2026-03-24T20:19:59Z @tobiu cross-referenced by #9546

