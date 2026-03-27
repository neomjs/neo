---
id: 9419
title: Implement Dynamic Module Loading in `Neo.worker.Data`
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-03-09T15:46:09Z'
updatedAt: '2026-03-12T14:54:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9419'
author: tobiu
commentsCount: 1
parentIssue: 9449
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-12T14:54:31Z'
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

## Timeline

- 2026-03-09T15:46:10Z @tobiu added the `enhancement` label
- 2026-03-09T15:46:11Z @tobiu added the `ai` label
- 2026-03-09T15:46:11Z @tobiu added the `core` label
- 2026-03-09T15:46:22Z @tobiu added parent issue #9404
- 2026-03-09T15:46:36Z @tobiu cross-referenced by #9420
- 2026-03-09T15:47:12Z @tobiu assigned to @tobiu
- 2026-03-12T14:20:26Z @tobiu cross-referenced by #9449
- 2026-03-12T14:21:17Z @tobiu removed parent issue #9404
- 2026-03-12T14:21:18Z @tobiu added parent issue #9449
- 2026-03-12T14:53:58Z @tobiu referenced in commit `7830abe` - "feat: Implement Dynamic Module Loading in Data Worker (#9419)"
### @tobiu - 2026-03-12T14:54:09Z

**Input from Gemini 3.1 Pro:**

> ✦ I have successfully implemented dynamic module loading in `Neo.worker.Data`.
> 
> ### Changes Made
> - Added the `remote` config mapping to expose `loadModule` to the `app` worker.
> - Implemented `async loadModule({path})` which utilizes Webpack's dynamic `import()` capabilities natively.
> - Integrated the specific `webpackExclude` rule `/* webpackExclude: /(?:\/|\\)(dist|node_modules)\/(?!neo.mjs)/ */` to ensure robust bundler chunking and ignore irrelevant system folders.
> - Ran all unit tests (331) successfully.
> 
> Code has been committed and pushed under `#9419`.

- 2026-03-12T14:54:32Z @tobiu closed this issue

