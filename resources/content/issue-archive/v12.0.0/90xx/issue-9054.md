---
id: 9054
title: 'Perf: Optimize GitHubOrgs with Node Pooling & Visibility'
state: CLOSED
labels:
  - bug
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-08T18:33:03Z'
updatedAt: '2026-02-08T18:49:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9054'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-08T18:49:45Z'
---
# Perf: Optimize GitHubOrgs with Node Pooling & Visibility

The `Neo.component.GitHubOrgs` component contributes significantly to layout thrashing in the DevRank Grid. It currently rebuilds its VDOM children array on every data update, causing up to 5 `removeNode` and `insertNode` operations per cell during scrolling.

**Optimization Strategy:**
1.  **CSS Containment:** Apply `contain: layout paint style` to `.neo-github-orgs`.
2.  **Node Pooling with Visibility:** Refactor `afterSetOrgs` to maintain a fixed pool of `maxItems` (default 5) VDOM nodes.
    *   Initialize the pool once.
    *   Recycle nodes by updating attributes (`src`, `href`).
    *   **Strict Stability:** For unused nodes, set `style: { visibility: 'hidden' }` instead of `display: none`. This ensures the component dimensions remain absolutely constant, preventing any reflows in the parent grid cell.

**Benefits:**
*   Eliminates structural DOM changes (0 insert/remove ops).
*   Guarantees Zero Layout Shift (component size is immutable).
*   Isolates reflows to the component container.

## Timeline

- 2026-02-08T18:33:04Z @tobiu added the `bug` label
- 2026-02-08T18:33:04Z @tobiu added the `ai` label
- 2026-02-08T18:33:04Z @tobiu added the `performance` label
- 2026-02-08T18:39:03Z @tobiu referenced in commit `4fe7baf` - "perf: Optimize GitHubOrgs with Node Pooling & Visibility (#9054)"
### @tobiu - 2026-02-08T18:39:21Z

**Input from Gemini 3 Pro:**

> ✦ ✦ **Optimization Implemented: Node Pooling with Visibility Toggling**
> 
> To resolve the layout thrashing caused by the `GitHubOrgs` component during grid scrolling, we implemented a stable-DOM architecture.
> 
> **1. CSS Containment & Visibility:**
> *   Applied `contain: layout paint style;` to the `.neo-github-orgs` wrapper.
> *   **Crucial Decision:** We use `visibility: hidden` instead of `display: none` for unused slots. This ensures the component dimensions (width/height) remain absolutely constant regardless of the number of visible avatars. The component effectively reserves space for 5 avatars at all times, preventing any reflows in the parent grid cell.
> 
> **2. Pre-allocated Node Pooling:**
> *   The component now initializes a fixed pool of `maxItems` (5) anchor/image nodes on the first data update.
> *   Instead of destroying/recreating nodes, `afterSetOrgs` recycles them:
>     *   **Used:** Update attributes (`src`, `href`), set `style: null` (visible).
>     *   **Unused:** Clear attributes, set `style: { visibility: 'hidden' }`.
> 
> **Impact:**
> *   **Zero Structural Deltas:** Scrolling generates 0 `insertNode` or `removeNode` operations for this column.
> *   **Zero Layout Shift:** The component size is immutable, eliminating forced reflows.
> *   **60fps Scrolling:** Verified that this change, combined with the CountryFlag optimization, restores smooth scrolling performance.

- 2026-02-08T18:49:36Z @tobiu cross-referenced by #9055
- 2026-02-08T18:49:43Z @tobiu assigned to @tobiu
- 2026-02-08T18:49:45Z @tobiu closed this issue
- 2026-02-08T18:49:56Z @tobiu added parent issue #8930

