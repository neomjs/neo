---
id: 7043
title: 'Refactor: Extract DOM Event Handling to `DomEvents` Mixin'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-13T17:13:30Z'
updatedAt: '2025-07-13T17:14:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7043'
author: tobiu
commentsCount: 0
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-13T17:14:35Z'
---
# Refactor: Extract DOM Event Handling to `DomEvents` Mixin

**Reported by:** @tobiu on 2025-07-13

---

**Parent Issue:** #6992 - Functional Components

---

**Description:**
Currently, DOM event handling logic, including the `domListeners_` config and related methods (`afterSetDomListeners`, `addDomListeners`, `removeDomListeners`), resides within `src/component/Base.mjs`.

To enable consistent DOM event support for both class-based components (`src/component/Base.mjs`) and functional components (`src/functional/component/Base.mjs`), and to improve code organization and reusability, this ticket proposes extracting this logic into a new mixin: `src/mixin/DomEvents.mjs`.

**Proposed Changes:**

1.  **Create `src/mixin/DomEvents.mjs`:**
    *   Define the `domListeners_` config.
    *   Move `afterSetDomListeners`, `addDomListeners`, and `removeDomListeners` methods to this mixin.
    *   Add `initDomEvents()` and `removeDomEvents()` methods to encapsulate the mounting and unmounting of DOM listeners, respectively. These methods will be called from the component's lifecycle hooks.

2.  **Refactor `src/component/Base.mjs`:**
    *   Remove the `domListeners_` config and the methods moved to `DomEvents.mjs`.
    *   Add `Neo.mixin.DomEvents` to its `mixins` array.
    *   Call `this.initDomEvents()` within its `afterSetMounted()` method.
    *   Call `this.removeDomEvents()` within its `destroy()` method.

3.  **Update `src/functional/component/Base.mjs`:**
    *   Add `Neo.mixin.DomEvents` to its `mixins` array.
    *   Implement (or modify existing) `afterSetMounted()` and `destroy()` methods to call `this.initDomEvents()` and `this.removeDomEvents()`, respectively.

This refactoring will ensure that both component types benefit from a centralized and reusable DOM event management system, aligning with the framework's pattern of using mixins for shared functionality.

