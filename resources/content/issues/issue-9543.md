---
id: 9543
title: Store Pipeline Instantiation and Legacy Parser Compatibility
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-03-24T16:07:41Z'
updatedAt: '2026-03-24T16:10:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9543'
author: tobiu
commentsCount: 0
parentIssue: 9449
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Store Pipeline Instantiation and Legacy Parser Compatibility

### Goal
Address the architectural friction introduced in `#9452` when migrating existing Stores to the new `Pipeline` architecture, specifically resolving the class instantiation issues within `Neo.data.Store`.

### Context
During the completion of `#9452` (Connection Foundation and Parser Refactoring), we successfully separated network logic from parsers. However, applying this to live stores (like `apps/devindex/store/Contributors.mjs`) revealed two major bottlenecks:

1. **Pipeline Instantiation Failure (`Store.mjs`)**: The `beforeSetPipeline` method in `Neo.data.Store` currently attempts to use `ClassSystemUtil.beforeSetInstance(value, null, ...)`. Because it passes `null` as the default class, supplying a raw `pipeline: { connection: {...}, parser: {...} }` config object fails to instantiate a `Neo.data.Pipeline` class, crashing with "missing className or module property".
2. **Dynamic Connection Imports**: If a Store requires a Connection in the App Worker (e.g., `connection.Stream`), attempting to use dynamic imports `module: () => import(...)` inside the Store's `pipeline` config fails synchronously during `ClassSystemUtil` instantiation. 
3. **Legacy Fallback**: `Neo.data.Store` still contains many references to `store.parser` and `store.url`.

### Acceptance Criteria
- **Fix Pipeline Instantiation**: Update `src/data/Store.mjs` to correctly resolve and instantiate `Neo.data.Pipeline` in `beforeSetPipeline()`.
- **Address Circular Dependencies**: Ensure importing `Pipeline` into `Store` (or vice versa) does not create unresolved circular dependencies during framework boot.
- **Bridge Legacy Configs**: Implement a temporary bridge in `Store.mjs` that detects legacy `parser: {}` and `url: ''` configs and automatically wraps them into a `pipeline: {}` config before `beforeSetPipeline` executes.
- **Fix DevIndex Tests**: Ensure `test/playwright/unit/app/devindex/StoreFilterProfile.spec.mjs` and `test/playwright/unit/data/StoreParser.spec.mjs` pass cleanly with the new architecture.

### Next Steps
This issue must be resolved to stabilize the codebase before proceeding with IPC routing (#9453).

## Timeline

- 2026-03-24T16:07:42Z @tobiu added the `enhancement` label
- 2026-03-24T16:07:42Z @tobiu added the `ai` label
- 2026-03-24T16:07:43Z @tobiu added the `architecture` label
- 2026-03-24T16:07:43Z @tobiu added the `core` label
- 2026-03-24T16:08:31Z @tobiu added parent issue #9449
- 2026-03-24T16:10:04Z @tobiu assigned to @tobiu

