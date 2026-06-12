---
id: 7445
title: Add `loadModule` RMA Method to App Worker
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-10-10T17:19:04Z'
updatedAt: '2025-10-10T17:21:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7445'
author: tobiu
commentsCount: 0
parentIssue: 7435
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-10T17:21:00Z'
---
# Add `loadModule` RMA Method to App Worker

To support a fully dynamic component testing environment, we need a way for the Playwright test runner (main thread) to dynamically load ES modules into the App Worker on demand. The current approach used by the Siesta harness, which involves a static manifest file (`test/components/app.mjs`), is brittle and does not support proper test isolation.

This task is to implement a new Remote Method Access (RMA) method, `loadModule()`, in `src/worker/App.mjs`.

## Acceptance Criteria

1.  Create a new `async` method `loadModule(path)` in `src/worker/App.mjs`.
2.  This method must use a dynamic `import()` statement to load the module specified by the `path`.
3.  Crucially, the import statement **must** include the `/* webpackIgnore: true */` magic comment to prevent webpack from trying to bundle the dynamic path.
4.  The new `loadModule` method must be added to the `remote.main` array in the `config` of `src/worker/App.mjs` to make it accessible from the main thread.

## Timeline

- 2025-10-10T17:19:04Z @tobiu assigned to @tobiu
- 2025-10-10T17:19:05Z @tobiu added the `enhancement` label
- 2025-10-10T17:19:05Z @tobiu added parent issue #7435
- 2025-10-10T17:20:51Z @tobiu referenced in commit `9e1eaa4` - "Add loadModule RMA Method to App Worker #7445"
- 2025-10-10T17:21:01Z @tobiu closed this issue

