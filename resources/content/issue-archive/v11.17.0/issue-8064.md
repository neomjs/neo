---
id: 8064
title: Optimize LivePreview Renderer Loading & Lifecycle
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-09T01:16:23Z'
updatedAt: '2025-12-09T01:18:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8064'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-09T01:17:21Z'
---
# Optimize LivePreview Renderer Loading & Lifecycle

Optimize the renderer loading mechanism in `Neo.code.LivePreview` to prevent redundant module fetching and ensure smoother initialization.

**Changes:**
1.  **Renderer Caching:** Implement a `renderers` object to cache instantiated renderers.
2.  **`loadRenderer` Method:** Create a dedicated method to handle dynamic importing and caching.
3.  **`initAsync` Integration:** Use `initAsync` to await the initial renderer load, ensuring `isReady` state reflects renderer availability.
4.  **Optimized `afterSetLanguage`:** Update to only trigger `loadRenderer` on runtime changes (when `oldValue` exists).
5.  **Execution Guard:** Update `afterSetRenderer` to only trigger `doRunSource` if `this.value` is truthy, handling edge cases of simultaneous config application.
6.  **Static Languages:** Add `static languages = ['markdown', 'neomjs']`.
7.  **`beforeSetLanguage`:** Implement validation against the `static languages` array.

**Goal:**
Improve performance and robustness of the `LivePreview` component when switching languages and initializing.

## Timeline

- 2025-12-09T01:16:25Z @tobiu added the `enhancement` label
- 2025-12-09T01:16:25Z @tobiu added the `ai` label
- 2025-12-09T01:16:25Z @tobiu added the `refactoring` label
- 2025-12-09T01:16:25Z @tobiu added the `architecture` label
- 2025-12-09T01:16:54Z @tobiu assigned to @tobiu
- 2025-12-09T01:17:13Z @tobiu referenced in commit `db5ba73` - "Optimize LivePreview Renderer Loading & Lifecycle #8064"
- 2025-12-09T01:17:21Z @tobiu closed this issue
### @tobiu - 2025-12-09T01:18:16Z

**Input from Gemini:**

> ✦ Refactoring complete.
> 
> **Changes:**
> 1.  **Optimization:** Implemented `renderers` cache in `LivePreview.mjs` to avoid redundant imports.
> 2.  **`loadRenderer`:** Added method for efficient dynamic loading and caching.
> 3.  **Initialization:** Updated `initAsync` to await initial renderer load.
> 4.  **Lifecycle:** Updated `afterSetLanguage` to handle runtime changes only.
> 5.  **Robustness:** Added `&& this.value` check in `afterSetRenderer` to prevent execution on empty values.
> 6.  **Validation:** Added `static languages` array and `beforeSetLanguage` validation method.
> 
> Verified code changes.


