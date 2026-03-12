---
id: 9420
title: Migrate Data Pipeline to Connection -> Parser -> Normalizer flow
state: OPEN
labels:
  - enhancement
  - ai
  - refactoring
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-03-09T15:46:34Z'
updatedAt: '2026-03-09T15:47:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9420'
author: tobiu
commentsCount: 0
parentIssue: 9449
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Migrate Data Pipeline to Connection -> Parser -> Normalizer flow

### Goal
Wire the new Parser/Normalizer architecture through the entire data pipeline, ensuring the Data Worker performs all transformations before sending data back to the App Worker.

### Context
With Normalizers defined and the Data Worker capable of dynamically loading them via RMA, the execution flow must be updated to shift heavy lifting out of the App Worker.

### Acceptance Criteria
- Deprecate/Rename `Neo.data.proxy.*` namespace in favor of `Neo.data.parser.*` (e.g., `Neo.data.parser.Stream`).
- `Store.load()` calls should pass the `parser` and `normalizer` module paths down to the `Connection` via the worker bridge.
- `Neo.data.connection.Fetch` and `Neo.data.connection.Xhr` (running in the Data Worker) must intercept the response, instantiate the requested Parser, pass the JS object to the requested Normalizer, and `postMessage` the *final flattened data* back to the App Worker.

### Dependencies
- Depends on Data Normalizer Architecture (#9418) and Dynamic Module Loading in Data Worker (#9419).

## Timeline

- 2026-03-09T15:46:36Z @tobiu added the `enhancement` label
- 2026-03-09T15:46:36Z @tobiu added the `ai` label
- 2026-03-09T15:46:37Z @tobiu added the `refactoring` label
- 2026-03-09T15:46:37Z @tobiu added the `architecture` label
- 2026-03-09T15:46:37Z @tobiu added the `core` label
- 2026-03-09T15:46:48Z @tobiu added parent issue #9404
- 2026-03-09T15:47:24Z @tobiu assigned to @tobiu
- 2026-03-12T14:20:26Z @tobiu cross-referenced by #9449
- 2026-03-12T14:21:21Z @tobiu removed parent issue #9404
- 2026-03-12T14:21:22Z @tobiu added parent issue #9449

