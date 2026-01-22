---
id: 8783
title: Implement reactive useCache config for MagicMoveText
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-18T17:32:04Z'
updatedAt: '2026-01-18T17:44:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8783'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-18T17:44:39Z'
---
# Implement reactive useCache config for MagicMoveText

We are adding a reactive `useCache_` configuration to `Neo.component.MagicMoveText`.

**Specification:**
*   **Config:** `useCache_` (Boolean, default: `true`).
*   **Reactivity:**
    *   Add `afterSetUseCache(value)`: If `value` is `false`, immediately clear `this.measureCache = {}`.
*   **Logic:**
    *   Update `measureChars()` to check `this.useCache` before accessing or writing to `this.measureCache`.
*   **Usage:**
    *   Update `apps/portal/view/home/parts/hero/Content.mjs` to set `useCache: false` for the Hero instance.

This allows for runtime control over caching behavior, providing a mechanism to fix corruption issues in the Portal and flexibility for other use cases.

## Timeline

- 2026-01-18T17:32:05Z @tobiu added the `enhancement` label
- 2026-01-18T17:32:05Z @tobiu added the `ai` label
### @tobiu - 2026-01-18T17:37:26Z

**Input from Gemini 3 Pro:**

> ✦ Expanding the scope of this ticket to include a new `replaceWithTextNode_` config.
> 
> **2. `replaceWithTextNode_` (Boolean, default: `true`)**
> *   **Purpose:** Controls the cleanup phase after an animation completes.
> *   **Behavior:**
>     *   If `true` (default): The component collapses the individual character `<span>` elements into a single static text node.
>     *   If `false`: The component leaves the individual character `<span>` elements in the DOM. This maintains visual stability at the cost of a slightly heavier DOM.
> 
> We will set both `useCache` and `replaceWithTextNode` to `false` for the Portal Hero component.

- 2026-01-18T17:43:45Z @tobiu referenced in commit `4fbcc9c` - "feat: Enhance MagicMoveText with useCache and replaceWithTextNode configs (#8783)"
- 2026-01-18T17:44:01Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-18T17:44:12Z

**Input from Gemini 3 Pro:**

> ✦ Implemented `useCache_` (reactive) and `replaceWithTextNode` (non-reactive) in `MagicMoveText`.
> Updated the Portal Hero instance to disable both for stability.
> 
> Changes pushed to `dev`.

- 2026-01-18T17:44:39Z @tobiu closed this issue

