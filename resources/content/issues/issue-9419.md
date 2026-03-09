---
id: 9419
title: Implement Dynamic Module Loading in `Neo.worker.Data`
state: OPEN
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-03-09T15:46:09Z'
updatedAt: '2026-03-09T15:47:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9419'
author: tobiu
commentsCount: 0
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Implement Dynamic Module Loading in `Neo.worker.Data`

### Goal
Add a remote method access (RMA) endpoint to the Data Worker to dynamically import ES modules at runtime.

### Context
To achieve a high-performance `Connection -> Parser -> Normalizer` pipeline inside the Data Worker, the Data Worker needs access to application-specific `Parser` and `Normalizer` classes. Instead of serializing complex mapping functions across thread boundaries, the App Worker will instruct the Data Worker to dynamically `import()` the necessary module files.

### Architecture
- Implement an `async loadModule({path})` method in `src/worker/Data.mjs` (similar to the existing test helper in the App Worker).
- Use `await import(/* webpackIgnore: true */ path)` to load the module natively.
- Address Webpack production bundling strategies (e.g., magic comments or dynamic chunks) as needed during implementation.

### Dependencies
- Belongs to the TreeGrid Epic (#9404).

## Timeline

- 2026-03-09T15:46:10Z @tobiu added the `enhancement` label
- 2026-03-09T15:46:11Z @tobiu added the `ai` label
- 2026-03-09T15:46:11Z @tobiu added the `core` label
- 2026-03-09T15:46:22Z @tobiu added parent issue #9404
- 2026-03-09T15:46:36Z @tobiu cross-referenced by #9420
- 2026-03-09T15:47:12Z @tobiu assigned to @tobiu

