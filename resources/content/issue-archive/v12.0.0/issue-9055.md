---
id: 9055
title: 'Feat: Configurable renderFullPool for GitHubOrgs Component'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-08T18:49:35Z'
updatedAt: '2026-02-08T18:54:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9055'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-08T18:54:36Z'
---
# Feat: Configurable renderFullPool for GitHubOrgs Component

The optimization implemented in #9054 (Fixed Pool + Visibility Hidden) forces the `GitHubOrgs` component to always occupy the width of `maxItems` (5 avatars), even if empty. While this prevents reflows in Grids, it breaks standard layout expectations (shrink-to-fit) when the component is used in other contexts (e.g., Cards, Forms).

**Tasks:**
1.  **Configurable Strategy:** Introduce a `renderFullPool` config to `Neo.component.GitHubOrgs` (default: `false`).
    *   `false`: Render only valid items (Standard Behavior).
    *   `true`: Render fixed pool with `visibility: hidden` (Grid Optimization).
2.  **Grid Integration:** Update `Neo.grid.column.GitHubOrgs` to default this config to `true`.
3.  **Documentation:** Apply the Knowledge Base Enhancement Strategy by adding rich JSDoc explaining the architectural trade-off.

## Timeline

- 2026-02-08T18:49:36Z @tobiu added the `enhancement` label
- 2026-02-08T18:49:36Z @tobiu added the `ai` label
- 2026-02-08T18:50:23Z @tobiu added parent issue #8930
- 2026-02-08T18:53:20Z @tobiu referenced in commit `b194f40` - "feat: Implement configurable renderFullPool for GitHubOrgs (#9055)"
### @tobiu - 2026-02-08T18:54:14Z

**Input from Gemini 3 Pro:**

> ✦ **Configurable Pooling Implemented**
> 
> We have successfully decoupled the grid-specific optimization from the general component behavior.
> 
> **Changes:**
> 1.  **`Neo.component.GitHubOrgs`:**
>     *   Added `renderFullPool` config (Default: `false`).
>     *   **False (Standard):** Renders only present items. Adapts to content.
>     *   **True (Grid Optimized):** Renders fixed pool of `maxItems` nodes using `visibility: hidden` for stability.
>     *   Added comprehensive JSDoc explaining the architectural trade-off.
> 
> 2.  **`Neo.grid.column.GitHubOrgs`:**
>     *   Updated default config to `renderFullPool: true`.
>     *   This ensures the Grid automatically opts-in to the zero-layout-shift behavior.
> 
> This solution preserves the performance gains for the DevRank Grid while keeping the `GitHubOrgs` component flexible for general use.

- 2026-02-08T18:54:34Z @tobiu assigned to @tobiu
- 2026-02-08T18:54:36Z @tobiu closed this issue

