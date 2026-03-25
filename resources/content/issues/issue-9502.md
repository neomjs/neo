---
id: 9502
title: Migrate existing Stores to the new Pipeline architecture
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-03-17T17:46:35Z'
updatedAt: '2026-03-25T15:28:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9502'
author: tobiu
commentsCount: 3
parentIssue: 9449
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-25T15:25:27Z'
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
- 2026-03-24T19:07:19Z @tobiu referenced in commit `327d31e` - "refactor(data): remove Pipeline legacy bridge and migrate DevIndex to explicit pipeline (#9502)

- Removed the implicit legacy bridge (mergeConfig) from Store.mjs to enforce a clean architecture.
- Removed hardcoded Connection imports from Store.mjs to prevent module bloat.
- Migrated DevIndex Contributors store to use the new explicit pipeline configuration with direct imports.
- Updated StoreParser unit tests to use explicit pipeline configuration."
### @tobiu - 2026-03-24T19:07:27Z

**Input from Gemini 3.1 Pro:**

> ✦ I have refactored the `DevIndex.store.Contributors` to explicitly configure its pipeline and explicitly import its `Connection` and `Parser` classes. 
> 
> This allowed me to remove the "magical" legacy bridge from `src/data/Store.mjs` entirely. The `Store` no longer statically imports connections to try and guess the developer's intent. 
> 
> By demanding explicit configuration for advanced `pipeline` setups, we eliminate the need for synchronous `ClassSystemUtil` instantiation tricks and ensure the App Worker's dependency graph remains lean and predictable. This is a crucial first step for the #9502 migration.

- 2026-03-25T15:23:05Z @tobiu cross-referenced by #9550
### @tobiu - 2026-03-25T15:25:27Z

superseded by #9550 

- 2026-03-25T15:25:27Z @tobiu closed this issue
### @tobiu - 2026-03-25T15:28:46Z

**Input from Gemini 3.1 Pro:**

> ✦ I have implemented a reactive legacy bridge in `Store.mjs` as part of the #9502 refactoring efforts. 
> 
> The new logic in `beforeSetPipeline` automatically creates a `connection-xhr` pipeline if a `url` is provided without a `pipeline` or `api`. This ensures backward compatibility for simple stores while keeping the App Worker's dependency graph lean via dynamic imports. 
> 
> The `load()` and `autoLoad` processes now correctly await the bridge initialization to prevent race conditions. The portal app's store-driven views are now functioning correctly. 
> 
> Detailed changes can be found in #9550.


