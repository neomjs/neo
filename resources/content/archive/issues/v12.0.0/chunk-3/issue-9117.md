---
id: 9117
title: Refactor Grid Footer Toolbar for Store Integration
state: CLOSED
labels:
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-02-12T18:54:33Z'
updatedAt: '2026-02-12T19:11:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9117'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-12T19:11:38Z'
---
# Refactor Grid Footer Toolbar for Store Integration

Refactor `Neo.grid.footer.Toolbar` to handle store integration natively.

**Changes:**
1.  **Promote Store Logic:** Move `store_` config and `beforeSetStore` listener management from `DevIndex.view.home.StatusToolbar` to `Neo.grid.footer.Toolbar`.
2.  **Standardize Listeners:** The base class should automatically bind `onStoreFilter`, `onStoreLoad`, and `onStoreProgress` if they are defined on the instance.
3.  **Refactor StatusToolbar:** Update `StatusToolbar` to rely on the inherited store management.

**Benefit:** This makes `Neo.grid.footer.Toolbar` a robust base class for any grid footer requiring store awareness (e.g., PagingToolbar, StatusBars), reducing boilerplate in subclasses.

## Timeline

- 2026-02-12T18:54:35Z @tobiu added the `ai` label
- 2026-02-12T18:54:35Z @tobiu added the `refactoring` label
- 2026-02-12T18:54:35Z @tobiu added the `core` label
- 2026-02-12T18:55:01Z @tobiu assigned to @tobiu
- 2026-02-12T19:11:21Z @tobiu referenced in commit `fed8bd7` - "docs: Add intent-driven JSDoc to Grid Footer Toolbar and StatusToolbar (#9117)"
### @tobiu - 2026-02-12T19:11:24Z

**Input from Gemini 3 Pro:**

> ✦ I have refactored `Neo.grid.footer.Toolbar` and `StatusToolbar` to implement a robust, reusable store integration pattern.
> 
> **Refactoring Highlights:**
> 1.  **`Neo.grid.footer.Toolbar` (Base):**
>     -   Added native `store_` config and `beforeSetStore` logic.
>     -   Automatically binds to `load`, `filter`, and `progress` store events using the `scope: me` configuration pattern (cleaner than manual binding).
>     -   Handles both instantiated `Store` objects and config objects.
>     -   Added placeholder methods (`onStoreLoad`, `onStoreFilter`, `onStoreProgress`) with intent-driven JSDoc to guide future implementations.
> 
> 2.  **`DevIndex.view.home.StatusToolbar` (Implementation):**
>     -   Removed redundant store boilerplate (`store_`, `beforeSetStore`).
>     -   Simplified logic to override the base class placeholders.
>     -   Used `getReference().set()` for atomic, efficient updates of the progress bar.
>     -   Added comprehensive JSDoc explaining its role in visualizing progressive loading.
> 
> This establishes a solid foundation for any future grid footers (like pagination) while cleaning up the DevIndex implementation.

- 2026-02-12T19:11:38Z @tobiu closed this issue
- 2026-02-12T19:11:54Z @tobiu added parent issue #9106

