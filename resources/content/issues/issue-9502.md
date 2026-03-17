---
id: 9502
title: Migrate existing Stores to the new Pipeline architecture
state: OPEN
labels:
  - enhancement
  - ai
  - refactoring
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-03-17T17:46:35Z'
updatedAt: '2026-03-17T17:46:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9502'
author: tobiu
commentsCount: 0
parentIssue: 9449
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Migrate existing Stores to the new Pipeline architecture

### Goal
Identify and migrate all existing `Neo.data.Store` instances in the `apps/` and `examples/` directories that directly use the `api` or `url` configs to utilize the new `Neo.data.Pipeline` architecture.

### Context
With the introduction of the `Pipeline` cornerstone (#9451), the `Store` now delegates data fetching and shaping to its `pipeline` config. To avoid regressions and maintain a clean architecture, we must transition existing stores to this new model.

### Acceptance Criteria
- Search `apps/` and `examples/` for store definitions using `api:` or `url:`.
- Refactor these stores to use the `pipeline` config.
- Ensure `Connection.Rpc` or `Connection.Fetch` is used within the pipeline as appropriate.
- Verify that examples and apps still function correctly after the migration.

## Timeline

- 2026-03-17T17:46:36Z @tobiu assigned to @tobiu
- 2026-03-17T17:46:37Z @tobiu added the `enhancement` label
- 2026-03-17T17:46:37Z @tobiu added the `ai` label
- 2026-03-17T17:46:37Z @tobiu added the `refactoring` label
- 2026-03-17T17:46:38Z @tobiu added the `architecture` label
- 2026-03-17T17:46:38Z @tobiu added the `core` label
- 2026-03-17T17:46:52Z @tobiu added parent issue #9449
- 2026-03-17T17:47:38Z @tobiu cross-referenced by #9449

