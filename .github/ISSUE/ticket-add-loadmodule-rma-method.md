# Ticket: Add `loadModule` RMA Method to App Worker

GH ticket id: #7445

**Assignee:** tobiu
**Status:** Done

**Parent Epic:** https://github.com/neomjs/neo/issues/7435

## Description

To support a fully dynamic component testing environment, we need a way for the Playwright test runner (main thread) to dynamically load ES modules into the App Worker on demand. The current approach used by the Siesta harness, which involves a static manifest file (`test/components/app.mjs`), is brittle and does not support proper test isolation.

This task is to implement a new Remote Method Access (RMA) method, `loadModule()`, in `src/worker/App.mjs`.

## Acceptance Criteria

1.  Create a new `async` method `loadModule(path)` in `src/worker/App.mjs`.
2.  This method must use a dynamic `import()` statement to load the module specified by the `path`.
3.  Crucially, the import statement **must** include the `/* webpackIgnore: true */` magic comment to prevent webpack from trying to bundle the dynamic path.
4.  The new `loadModule` method must be added to the `remote.main` array in the `config` of `src/worker/App.mjs` to make it accessible from the main thread.
