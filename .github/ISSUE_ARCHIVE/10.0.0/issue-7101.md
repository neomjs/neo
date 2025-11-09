---
id: 7101
title: 'Refactor: Remove redundant createBindings() call from onConstructed'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-23T12:13:59Z'
updatedAt: '2025-07-23T12:14:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7101'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-23T12:14:37Z'
---
# Refactor: Remove redundant createBindings() call from onConstructed

**Reported by:** @tobiu on 2025-07-23

## Description

During the refactoring of the state provider logic into `component.Abstract`, it was identified that `createBindings()` is called from two separate lifecycle methods: `initConfig()` and `onConstructed()`.

The call sequence is as follows:
1. `Neo.create()`
2. `constructor()` -> `construct()`
3. `initConfig()` -> `createBindings()`
4. `onConstructed()` -> `createBindings()` (redundant)

`initConfig()` runs first, during the initial construction and configuration of the component. `onConstructed()` is called by `Neo.create()` after the constructor chain has completed.

Since `initConfig()` already sets up the necessary bindings based on the component's configuration, the subsequent call in `onConstructed()` is redundant and serves no purpose. It attempts to create the same bindings a second time.

## Task

Remove the redundant call to `this.getStateProvider()?.createBindings(this)` from the `onConstructed()` method within `src/component/Abstract.mjs`. The call within `initConfig()` should remain as it is the correct and sufficient place for this logic.

### Affected Files

- `src/component/Abstract.mjs`

