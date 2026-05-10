---
id: 7100
title: 'Refactor: Move State Provider logic to component.Abstract'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-23T12:05:02Z'
updatedAt: '2025-10-22T22:54:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7100'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-23T12:06:01Z'
---
# Refactor: Move State Provider logic to component.Abstract

## Description

Currently, all logic related to `state.Provider` (the `bind` and `stateProvider_` configs, the `getStateProvider()` method, etc.) resides entirely within `src/component/Base.mjs`.

The base class for functional components, `Neo.functional.component.Base`, extends `Neo.component.Abstract` but does **not** extend `Neo.component.Base`. This architectural separation prevents functional components from accessing and using state providers, which is a key feature for v10.

The `createVdom` method signature in `functional.component.Base` was already updated to anticipate access to provider data via `config.data`, making it clear that this functionality is intended.

## Task

To solve this, we need to refactor the state provider logic out of `component.Base` and move it up the inheritance chain into `component.Abstract`. This will make the state provider system available to both classic class-based components and modern functional components.

### Key Logic to Move

The following configs, methods, and lifecycle logic must be moved from `src/component/Base.mjs` to `src/component/Abstract.mjs`:

-   **Configs:**
    -   `bind`
    -   `modelData`
    -   `stateProvider_`
    -   `data_` (the convenience getter)
    -   `parentComponent_` (dependency for `getConfigInstanceByNtype`)
-   **Methods:**
    -   `beforeSetStateProvider()`
    -   `afterSetStateProvider()`
    -   `getStateProvider()`
    -   `getState()`
    -   `setState()`
    -   `beforeGetData()`
    -   `getConfigInstanceByNtype()` (dependency for `getStateProvider`)
-   **Lifecycle Logic:**
    -   The `stateProvider` related calls inside `destroy()`, `initConfig()`, and `onConstructed()` need to be moved.
-   **Two-Way Binding Logic:**
    -   The logic inside `afterSetConfig()` that handles two-way data binding needs to be moved.

### Affected Files

-   `src/component/Abstract.mjs` (target for new logic)
-   `src/component/Base.mjs` (source of logic to be moved)
-   `src/functional/component/Base.mjs` to not pass data to createVdom() => performance => access via `config.data`

## Timeline

- 2025-07-23T12:05:03Z @tobiu assigned to @tobiu
- 2025-07-23T12:05:04Z @tobiu added the `enhancement` label
- 2025-07-23T12:05:48Z @tobiu referenced in commit `aad159e` - "Refactor: Move State Provider logic to component.Abstract #7100"
- 2025-07-23T12:06:01Z @tobiu closed this issue

