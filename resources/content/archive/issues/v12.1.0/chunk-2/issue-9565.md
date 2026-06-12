---
id: 9565
title: 'Regression: Store.load({url}) fails when Store has no initial URL config'
state: CLOSED
labels:
  - bug
  - ai
  - regression
  - core
assignees:
  - tobiu
createdAt: '2026-03-26T18:09:10Z'
updatedAt: '2026-03-26T18:10:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9565'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-26T18:10:18Z'
---
# Regression: Store.load({url}) fails when Store has no initial URL config

### Goal
Restore the ability for `Store.load({ url: '...' })` to function correctly when the Store was initialized without a `url` or explicit `pipeline` configuration.

### Context
In the recent data layer refactoring (moving toward explicit Pipelines), we introduced a regression. A `Store` that is instantiated without a `url` gets a dummy Pipeline without a `Connection` assigned. 

When a dynamic URL is later passed directly to `store.load({ url: 'data.json' })`, the Pipeline attempts to read from a missing connection (`me.pipeline.connection` is undefined) because the legacy bridge in `beforeSetPipeline` only builds the `Xhr` connection if `me.url` is set during initialization. 

This specifically broke the Portal App's learning and release notes views (`apps/portal/view/learn/MainContainerController.mjs`), as they load their Content stores dynamically based on route parameters rather than having a static URL on the Store class definition.

### Acceptance Criteria
1. Update `Store.load()` to check if `opts.url` is present but the `pipeline` lacks a `connection`.
2. If so, dynamically import and assign a `Neo.data.connection.Xhr` instance to the pipeline just-in-time, using the provided URL.
3. Ensure this logic executes correctly before `await me.pipeline.read(params)`.
4. Create a new unit test `test/playwright/unit/data/StoreDynamicUrl.spec.mjs` that verifies this specific scenario (no initial URL, but URL passed to `load()`).

## Timeline

- 2026-03-26T18:09:12Z @tobiu added the `bug` label
- 2026-03-26T18:09:12Z @tobiu added the `ai` label
- 2026-03-26T18:09:13Z @tobiu added the `regression` label
- 2026-03-26T18:09:13Z @tobiu added the `core` label
- 2026-03-26T18:09:34Z @tobiu referenced in commit `6ba36df` - "fix(data): Re-enable dynamic URL connection instantiation in Store.load() (#9565)"
- 2026-03-26T18:09:47Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-26T18:09:50Z

**Input from Gemini 3.1 Pro:**

> ✦ I have resolved the regression.
> 
> **Fix Details:**
> The issue was caused by the Pipeline refactoring. If a Store is created without an initial `url`, it gets a dummy Pipeline without a Connection. If a URL is then passed dynamically during `store.load({ url: '...' })`, the Pipeline had no connection to execute the `read()` against.
> 
> I updated `src/data/Store.mjs` within the `load()` method to check for this exact edge case. If a dynamic `opts.url` is provided and the pipeline lacks a connection, it now uses a dynamic `import` to grab `connection/Xhr.mjs` and instantiates it just-in-time on the pipeline before executing `pipeline.read()`.
> 
> I also created `test/playwright/unit/data/StoreDynamicUrl.spec.mjs` with a mocked global `XMLHttpRequest` to explicitly test and prevent this regression in the future.
> 
> The fix has been committed and pushed. I will close this issue now.

- 2026-03-26T18:10:19Z @tobiu closed this issue

