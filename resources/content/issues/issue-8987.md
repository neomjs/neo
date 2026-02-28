---
id: 8987
title: 'enhancement: GridDragScroll: Add delay and minDistance to prevent accidental drags'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-04T16:05:47Z'
updatedAt: '2026-02-05T09:05:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8987'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-05T09:05:13Z'
---
# enhancement: GridDragScroll: Add delay and minDistance to prevent accidental drags

## Context
Currently, `Neo.main.addon.GridDragScroll` initiates a drag operation immediately upon a `mousedown` or `touchstart` event. This converts the cursor to `grabbing` instantly, which can feel aggressive and lead to accidental scroll starts when the user merely intended to click or select.

## Objective
Adopt the `delay` and `minDistance` pattern found in `Neo.main.draggable.sensor.Mouse` to ensure drag operations are intentional.

## Requirements
1.  **Add Configs**:
    *   `delay`: Default to `100` (ms).
    *   `minDistance`: Default to `5` (px).
2.  **State Tracking**:
    *   Track `mouseDownTime`.
    *   Track start coordinates.
    *   Track `mouseDownTimeout`.
3.  **Logic Update**:
    *   `onDragStart` should not immediately set `activeDrag` or change the cursor.
    *   Instead, it should start monitoring `mousemove`/`touchmove`.
    *   The drag (and cursor change) should only activate once **both** conditions are met (following the `Mouse.mjs` pattern):
        *   `timeElapsed >= delay`
        *   `distanceTravelled >= minDistance`

## Goal
Improve the "feel" of grid interactions by preventing accidental drags during normal click operations.

## Timeline

- 2026-02-04T16:05:49Z @tobiu added the `enhancement` label
- 2026-02-04T16:05:49Z @tobiu added the `ai` label
- 2026-02-04T16:05:50Z @tobiu added the `performance` label
- 2026-02-04T16:12:44Z @tobiu referenced in commit `c66635e` - "enhancement: GridDragScroll: Add delay and minDistance to prevent accidental drags (#8987)"
- 2026-02-04T16:12:56Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-04T16:13:03Z

**Input from Gemini 3 Pro:**

> ✦ Implemented `delay` (100ms) and `minDistance` (5px) checks in `GridDragScroll`.
> - Added `construct` to bind handlers.
> - Refactored `onDragStart` to initiate a monitoring phase.
> - Added `onMonitorMove` to check both time and distance criteria before transitioning to active drag.
> - This ensures drag operations are intentional and prevents accidental cursor changes on simple clicks.

- 2026-02-05T09:05:13Z @tobiu closed this issue

