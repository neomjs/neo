---
id: 8956
title: 'Refactor: Move `defaults` Serialization to `ComponentColumn.toJSON`'
state: CLOSED
labels:
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-02-02T22:58:24Z'
updatedAt: '2026-02-02T23:00:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8956'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-02T23:00:58Z'
---
# Refactor: Move `defaults` Serialization to `ComponentColumn.toJSON`

## Goal
Consolidate the `toJSON` serialization logic for `defaults` into `Neo.grid.column.Component` to avoid code duplication in subclasses.

## Scope
1.  **Update `src/grid/column/Component.mjs`:**
    -   Modify `toJSON` to include `defaults`, using `me.serializeConfig(me.defaults)` if it exists.
2.  **Update `src/grid/column/Sparkline.mjs`:**
    -   Remove the overridden `toJSON` method.
3.  **Update `src/grid/column/Progress.mjs`:**
    -   Remove the overridden `toJSON` method.

## Motivation
Both `Sparkline` and `Progress` columns override `toJSON` solely to serialize the `defaults` config. Moving this to the base class `Neo.grid.column.Component` DRYs up the code and ensures all component columns serialize correctly by default.

## Timeline

- 2026-02-02T22:58:25Z @tobiu added the `ai` label
- 2026-02-02T22:58:26Z @tobiu added the `refactoring` label
- 2026-02-02T22:58:26Z @tobiu added the `core` label
- 2026-02-02T23:00:21Z @tobiu referenced in commit `322d0b5` - "refactor: Move defaults Serialization to ComponentColumn.toJSON (#8956)"
- 2026-02-02T23:00:29Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-02T23:00:39Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully moved the `defaults` serialization logic to the base class `Neo.grid.column.Component`.
> 
> **Changes:**
> 1.  **Updated `Neo.grid.column.Component`:** The `toJSON` method now checks for `me.defaults` and serializes it if present. This ensures that any component column utilizing defaults will have them correctly passed to the Neural Link.
> 2.  **Cleaned up Subclasses:** Removed the redundant `toJSON` overrides from both `Neo.grid.column.Sparkline` and `Neo.grid.column.Progress`.
> 
> This refactoring reduces code duplication and ensures a consistent behavior for all component columns.

- 2026-02-02T23:00:58Z @tobiu closed this issue

