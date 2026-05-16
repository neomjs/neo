---
id: 9865
title: 'Multi-Body: Centralize Selection Model Orchestration in GridContainer'
state: OPEN
labels:
  - enhancement
  - epic
  - ai
  - refactoring
  - grid
assignees:
  - tobiu
createdAt: '2026-04-10T11:30:43Z'
updatedAt: '2026-04-10T12:16:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9865'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Multi-Body: Centralize Selection Model Orchestration in GridContainer

## The Problem
Currently, updating the `selectionModel` dynamically in a Multi-Body Grid setup requires manual boilerplate inside App Controllers (like `DevIndex`'s `MainContainerController`), as consumers have to manually query and sync `bodyStart` and `bodyEnd` alongside `body`. This violates separation of concerns and leads to fragile implementations where locked columns lose their Selection Models.

## The Solution
We will elevate the `selectionModel` configuration to `Neo.grid.Container`. The Container will act as the orchestrator:
1. It will introduce `selectionModel_` as a reactive config.
2. `GridContainer.afterSetSelectionModel(value)` will automatically clone and distribute the configuration to `body`, `bodyStart`, and `bodyEnd`.
3. When SubGrids are dynamically generated in `createOrUpdateSubGrids`, the Container will ensure they natively inherit the active `selectionModel`.

By removing this burden from the consumer, we restore the abstraction that a Multi-Body Grid behaves as a single logical entity.

## Timeline

- 2026-04-10T11:30:45Z @tobiu added the `enhancement` label
- 2026-04-10T11:30:45Z @tobiu added the `epic` label
- 2026-04-10T11:30:45Z @tobiu added the `ai` label
- 2026-04-10T11:30:45Z @tobiu added the `refactoring` label
- 2026-04-10T11:30:45Z @tobiu added the `grid` label
- 2026-04-10T12:16:16Z @tobiu assigned to @tobiu

