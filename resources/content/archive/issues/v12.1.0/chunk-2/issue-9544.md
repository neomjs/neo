---
id: 9544
title: Enhance RemoteMethodAccess to Support Instance-to-Instance Routing
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-03-24T19:31:35Z'
updatedAt: '2026-03-25T08:38:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9544'
author: tobiu
commentsCount: 1
parentIssue: 9449
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-24T19:44:22Z'
---
# Enhance RemoteMethodAccess to Support Instance-to-Instance Routing

### Goal
Upgrade the `RemoteMethodAccess` (RMA) mixin to support routing messages to specific class instances across worker boundaries, rather than being limited to static Singletons.

### Context
Currently, the RMA mixin (`src/worker/mixin/RemoteMethodAccess.mjs`) resolves remote method targets exclusively via static namespaces (e.g., `let pkg = Neo.ns(msg.remoteClassName)`). This works perfectly for Singletons like Managers or Main Thread Addons. 

However, to support the new `Neo.data.Pipeline` architecture (Epic #9449) where an App Worker Pipeline dynamically spawns and communicates with a counterpart Pipeline *instance* in the Data Worker, we need a generic way to target instances by their `id`. 

Instead of hardcoding domain-specific routers (like an `onPipelineExecute` handler) inside `Neo.worker.Data`, we should elevate RMA to be a universal, bi-directional instance-to-instance communication layer.

### Acceptance Criteria
- Modify `onRemoteMethod` in `src/worker/mixin/RemoteMethodAccess.mjs` to check the incoming `msg` payload for a target instance ID (e.g., `msg.instanceId`).
- If `instanceId` is provided, resolve the target object using `Neo.manager.Instance.get(msg.instanceId)`.
- If no ID is provided, gracefully fall back to the existing static namespace resolution (`Neo.ns(className)`) to maintain backward compatibility for all existing Singletons.
- Ensure the existing robust features of RMA (Promise tracking, error catching, and zero-copy transferable handling) work seamlessly for instance-based execution.

## Timeline

- 2026-03-24T19:31:37Z @tobiu added the `enhancement` label
- 2026-03-24T19:31:37Z @tobiu added the `ai` label
- 2026-03-24T19:31:37Z @tobiu added the `architecture` label
- 2026-03-24T19:31:37Z @tobiu added the `core` label
- 2026-03-24T19:31:49Z @tobiu added parent issue #9449
- 2026-03-24T19:43:42Z @tobiu referenced in commit `4e0d3ef` - "feat(worker): Enhance RemoteMethodAccess to support instance-to-instance routing (#9544)

- Modified generateRemote to include an optional 'id' in the message payload.
- Modified onRemoteMethod to resolve the target instance via Neo.manager.Instance if 'remoteId' is present, falling back to static namespace resolution.
- Added comprehensive unit tests for the new RMA routing capabilities."
### @tobiu - 2026-03-24T19:43:55Z

**Input from Gemini 3.1 Pro:**

> ✦ I have successfully implemented and merged the enhancement to the `RemoteMethodAccess` (RMA) mixin. 
> 
> ### Architectural Briefing: Instance-to-Instance IPC
> 
> For future developers and AI agents reviewing this architecture, it is critical to understand how RMA now bridges the isolated memory spaces of different worker threads.
> 
> **The Challenge:**
> Each worker thread (App Worker, Data Worker, etc.) has its own completely isolated Javascript memory space, its own `idCounter`, and its own `Neo.manager.Instance` registry. 
> Because of this, an ID like `pipeline-1` might exist in both the App Worker and the Data Worker simultaneously, but they refer to completely different objects in their respective memory spaces.
> 
> **The Solution: The Illusion of Global IDs & The Handshake**
> We bypass this limitation not by creating truly global IDs, but by exchanging local IDs between threads in a "Handshake":
> 
> 1. **The Handshake (Exchange of Local IDs):**
>    When an instance in the App Worker (e.g., App-Pipeline, local ID: `app-pipe-1`) wants to spawn a counterpart in the Data Worker, it sends a `createInstance` IPC message.
>    *Crucially*, it includes its own ID in the config payload sent over the wire: `{ appPipelineId: 'app-pipe-1' }`.
>    The Data Worker receives this, creates its own local instance (e.g., Data-Pipeline, local ID: `data-pipe-4`), and replies with *its* newly generated ID.
>    Now, both instances know the *local ID* of their counterpart in the other thread's memory space.
> 
> 2. **The Execution (Bi-Directional RMA):**
>    We enhanced `src/worker/mixin/RemoteMethodAccess.mjs` to recognize a new `remoteId` property in IPC messages.
>    *   **App -> Data:** When the App Worker wants to execute `read()` remotely, it calls `this.generateRemote({ origin: 'data', id: 'data-pipe-4' }, 'read')`. When this message arrives in the Data Worker, RMA intercepts it, sees `remoteId: 'data-pipe-4'`, and successfully looks it up in the **Data Worker's** local `Instance` manager.
>    *   **Data -> App:** When the Data Worker needs to push streaming data back, it uses the ID it received during the handshake: `this.generateRemote({ origin: 'app', id: 'app-pipe-1' }, 'onParserData')`. This message arrives in the App Worker, and RMA finds it in the **App Worker's** local registry.
> 
> **Summary**
> By adding `msg.remoteId` to the RMA mixin, we have created a decoupled, bidirectional IPC layer for instances. The RMA mixin does not care *how* you acquired the ID; it trusts that if you provide a `destination` worker and a `remoteId`, it will route the method call directly to that instance within the target worker's isolated registry. This elegant mechanism powers the entire cross-worker Unified Data Pipeline.

- 2026-03-24T19:44:23Z @tobiu closed this issue
- 2026-03-24T19:49:12Z @tobiu referenced in commit `962da05` - "feat(worker): Enhance RemoteMethodAccess to support instance-to-instance routing (#9544)

- Modified generateRemote to include an optional 'id' in the message payload.
- Modified onRemoteMethod to resolve the target instance via Neo.manager.Instance if 'remoteId' is present, falling back to static namespace resolution.
- Added comprehensive unit tests for the new RMA routing capabilities."
- 2026-03-24T19:51:09Z @tobiu referenced in commit `3c8640f` - "feat(worker): Enhance RemoteMethodAccess to support instance-to-instance routing (#9544)

- Modified generateRemote to include an optional 'id' in the message payload.
- Modified onRemoteMethod to resolve the target instance via Neo.manager.Instance if 'remoteId' is present, falling back to static namespace resolution.
- Added comprehensive unit tests for the new RMA routing capabilities."
- 2026-03-24T20:09:51Z @tobiu cross-referenced by #9453
- 2026-03-25T08:38:02Z @tobiu assigned to @tobiu

