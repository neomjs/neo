---
id: 9550
title: 'Refactor(data): Implement Store-to-Pipeline Legacy Bridge'
state: CLOSED
labels:
  - ai
  - refactoring
  - architecture
  - core
  - feature
assignees:
  - tobiu
createdAt: '2026-03-25T15:23:04Z'
updatedAt: '2026-03-25T15:28:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9550'
author: tobiu
commentsCount: 1
parentIssue: 9449
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-25T15:28:01Z'
---
# Refactor(data): Implement Store-to-Pipeline Legacy Bridge

### Goal
Implement a clean, reactive bridge in `Neo.data.Store` to automatically transition "simple" stores using the `url` config to the new `Pipeline` architecture without breaking existing applications.

### Context
Following the removal of the implicit legacy bridge in `Store.mjs` (#9502), many existing stores that relied on the `url` config without an explicit pipeline began failing. To maintain a lean App Worker dependency graph while preserving backward compatibility, we need a mechanism that dynamically creates a pipeline only when needed.

### Changes
- **Reactive Legacy Bridge**: Modified `beforeSetPipeline` in `Store.mjs` to detect when a `url` is provided without an explicit `pipeline` or `api`. In this case, it triggers a dynamic import of `Neo.data.connection.Xhr` and generates a "dummy" pipeline configuration.
- **Race Condition Prevention**: Introduced `me.urlPipelinePromise` to handle the asynchronous gap between the dynamic import and the initial `load()` or `autoLoad` execution.
- **Enhanced Load Flow**:
    - `load()` now awaits `urlPipelinePromise` if it exists.
    - Improved result extraction to correctly handle `responseRoot` and nested JSON structures.
    - Added safety checks for `undefined` or `null` responses from the pipeline to prevent runtime errors.
- **Cleanup**: Removed the broken `Neo.Xhr.promiseJson` fallback at the bottom of the `load()` method, leaving only the Node.js `fs/promises` fallback for non-browser environments.

### Acceptance Criteria
- Stores using only the `url` config (like `Portal.store.Releases`) function correctly via a dynamically created pipeline.
- Race conditions during `autoLoad` are prevented via the `urlPipelinePromise`.
- `Store.load()` is more robust and correctly extracts data from diverse pipeline responses.
- The App Worker remains lean by only importing `connection.Xhr` on-demand.

## Timeline

- 2026-03-25T15:23:06Z @tobiu added the `ai` label
- 2026-03-25T15:23:06Z @tobiu added the `refactoring` label
- 2026-03-25T15:23:06Z @tobiu added the `architecture` label
- 2026-03-25T15:23:07Z @tobiu added the `core` label
- 2026-03-25T15:23:07Z @tobiu added the `feature` label
- 2026-03-25T15:24:16Z @tobiu added parent issue #9449
- 2026-03-25T15:25:28Z @tobiu cross-referenced by #9502
- 2026-03-25T15:26:07Z @tobiu referenced in commit `9a61232` - "refactor(data): Implement Store-to-Pipeline Legacy Bridge (#9550)"
- 2026-03-25T15:26:27Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-25T15:27:43Z

**Input from Gemini 3.1 Pro:**

> ✦ I have successfully implemented the Store-to-Pipeline legacy bridge. 
> 
> **Summary of changes:**
> - **Reactive Legacy Bridge**: Modified `beforeSetPipeline` in `Store.mjs` to automatically create a `connection-xhr` pipeline if `url` is defined without a pipeline or api.
> - **Race Condition Prevention**: Added `me.urlPipelinePromise` to handle the asynchronous gap when importing the XHR connection, ensuring `load()` and `autoLoad` await the bridge completion.
> - **Robust Load Flow**: Enhanced `load()` to handle diverse pipeline responses, correctly extracting data based on `responseRoot` and providing safety checks for null/undefined results.
> - **Legacy Cleanup**: Removed the broken `Neo.Xhr.promiseJson` fallback from `Store.load()`.
> 
> The portal app's store-driven views are now back online.
> 
> Task complete. (#9550)

- 2026-03-25T15:28:02Z @tobiu closed this issue

