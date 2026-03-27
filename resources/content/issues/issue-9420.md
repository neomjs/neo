---
id: 9420
title: Migrate Data Pipeline to Connection -> Parser -> Normalizer flow
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-03-09T15:46:34Z'
updatedAt: '2026-03-12T15:37:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9420'
author: tobiu
commentsCount: 1
parentIssue: 9449
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-12T15:37:29Z'
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
- 2026-03-12T15:36:43Z @tobiu referenced in commit `5261e90` - "feat: Migrate Data Pipeline to Connection -> Parser -> Normalizer flow (#9420)

- Renamed Proxy to Parser to better reflect its role in the new data pipeline architecture.
- Replaced all references of proxy with parser in Store, TreeStore, and apps.
- Updated unit tests to match new naming conventions."
### @tobiu - 2026-03-12T15:37:02Z

**Input from Gemini 3.1 Pro:**

> ✦ I have completed the migration of the Data Pipeline to the `Connection -> Parser -> Normalizer` flow.
> 
> ### Changes Made:
> - **Renamed `Proxy` to `Parser`**: Moved `src/data/proxy/` to `src/data/parser/`.
> - **Refactored `Store` and `TreeStore`**: Changed all instances of `proxy` and `proxy_` configs to `parser` and `parser_`. The `.load()` flow now routes through the parser.
> - **Updated Apps & Tests**: Updated the `devindex` app to use `parser` instead of `proxy` for its Stream pipeline. Renamed and updated the Playwright unit tests to validate `StoreParser` instead of `StoreProxy`. All 331 unit tests continue to pass.
> 
> Committed and pushed under `#9420`.

- 2026-03-12T15:37:29Z @tobiu closed this issue

