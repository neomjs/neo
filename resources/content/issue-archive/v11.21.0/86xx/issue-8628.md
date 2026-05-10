---
id: 8628
title: '[Docs] Apply Knowledge Base Enhancement Strategy to Fragment Implementation'
state: CLOSED
labels:
  - documentation
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-14T01:14:12Z'
updatedAt: '2026-01-14T01:21:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8628'
author: tobiu
commentsCount: 1
parentIssue: 8601
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T01:21:17Z'
---
# [Docs] Apply Knowledge Base Enhancement Strategy to Fragment Implementation

Apply the **3.2. Knowledge Base Enhancement Strategy** (from `AGENTS_STARTUP.md`) to the artifacts produced by Epic #8601.

**Goal:** Ensure the new Fragment architecture is fully discoverable and semantically indexed by the AI Knowledge Base.

**Scope:**
Review and enhance JSDoc comments for:
1.  `src/container/Fragment.mjs`
    *   Add `@summary` and detailed architectural context.
    *   Add "semantic signposts" (e.g., "wrapperless grouping", "phantom container").
2.  `src/vdom/Helper.mjs`
    *   Document the indexing logic (1 logical = N physical).
3.  `src/main/DeltaUpdates.mjs`
    *   Document the "Fragment Deltas" strategy in `insertNode`, `moveNode`, `removeNode`.
4.  `src/container/Base.mjs`
    *   Document the atomic move logic in `insert` and `remove`.

**Requirements:**
*   Use intent-driven comments (WHY, not just WHAT).
*   Add `@see` links to relevant tests and the example app.
*   Ensure `@summary` tags are present on modified classes/methods.

## Timeline

- 2026-01-14T01:14:13Z @tobiu added the `documentation` label
- 2026-01-14T01:14:13Z @tobiu added the `ai` label
- 2026-01-14T01:14:13Z @tobiu added the `core` label
- 2026-01-14T01:14:20Z @tobiu added parent issue #8601
- 2026-01-14T01:20:59Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-14T01:21:03Z

**Input from Gemini 3 Pro:**

> ✦ I have enhanced the JSDoc documentation for the Fragment implementation across the codebase, applying the Knowledge Base Enhancement Strategy.
> 
> **Changes:**
> 1.  **`src/container/Fragment.mjs`:**
>     *   Added a comprehensive `@summary`.
>     *   Explained "Wrapperless Rendering" and "Layout Participation".
>     *   Added semantic signposts: "Phantom Node", "Ghost Container", "Transparent Container".
>     *   Added `@see` links to `Neo.vdom.Helper` and the reference example `Neo.examples.container.fragment.MainContainer`.
> 2.  **`src/vdom/Helper.mjs`:**
>     *   `compareAttributes`: Explained the "transparency" optimization (ignoring attributes).
>     *   `getFragmentPhysicalCount`: Documented the `2 (anchors) + children` formula.
>     *   `getPhysicalIndex`: Explained the mapping between logical (1 item) and physical (N nodes) indices.
> 3.  **`src/main/DeltaUpdates.mjs`:**
>     *   `moveNode`: Documented the "Atomic Move" logic (using `moveBefore`) and the Fragment fallback (range extraction via XPath).
>     *   Added context to helper methods `getFragmentStart`, `getFragmentSibling`, and `getFragmentNodes`.
> 4.  **`src/container/Base.mjs`:**
>     *   `removeAt`: Documented the critical `keepMounted` parameter for preserving component state during atomic moves.
> 
> These updates ensure that the AI Knowledge Base can now semantically understand and retrieve information about the Fragment architecture, including *why* it works the way it does.

- 2026-01-14T01:21:17Z @tobiu closed this issue

