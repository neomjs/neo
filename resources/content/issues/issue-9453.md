---
id: 9453
title: Implement Pipeline IPC and Remote Execution Routing
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-03-12T18:23:01Z'
updatedAt: '2026-03-12T21:03:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9453'
author: tobiu
commentsCount: 0
parentIssue: 9449
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Implement Pipeline IPC and Remote Execution Routing

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

