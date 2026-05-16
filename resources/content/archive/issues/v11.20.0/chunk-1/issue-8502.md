---
id: 8502
title: Refine Ticket Index Structure for TreeList
state: CLOSED
labels:
  - enhancement
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-01-10T14:41:11Z'
updatedAt: '2026-01-10T14:51:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8502'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T14:51:13Z'
---
# Refine Ticket Index Structure for TreeList

Update `buildScripts/createTicketIndex.mjs` to generate a hierarchical JSON structure compatible with the Portal's TreeList component.

**Requirements:**
1.  **Hierarchy:** Output a flat list of nodes where each node has `id`, `parentId`, `leaf`, and `collapsed` properties.
2.  **Grouping:**
    *   **Archived Tickets:** Group by version folder name (e.g., "11.19.1").
    *   **Active Tickets:** Group under a "Latest" folder.
3.  **Sorting:**
    *   **Versions (Folders):** Descending order (newer versions first). "Latest" folder always on top.
    *   **Tickets (Leaves):** Sorted by `closedAt` DESC (fallback to `updatedAt` DESC).
4.  **Tree Fields:** Ensure tickets are marked as leaves (`leaf: true`) and version folders as parents (`leaf: false`, `collapsed: true` by default, except "Latest" which should be expanded).
5.  **Output Order:** The JSON array should reference the visual order: `[ParentA, ChildA1, ChildA2, ParentB, ChildB1...]`.
6.  **Expansion State:** The first folder (Latest) should be expanded (`collapsed: false`), while all other folders (Archive Versions) should be collapsed (`collapsed: true`).

This refinement enables the "Tickets" view in the Portal.

## Timeline

- 2026-01-10T14:41:12Z @tobiu added the `enhancement` label
- 2026-01-10T14:41:12Z @tobiu added the `ai` label
- 2026-01-10T14:41:12Z @tobiu added the `build` label
- 2026-01-10T14:41:22Z @tobiu added parent issue #8398
- 2026-01-10T14:50:04Z @tobiu referenced in commit `5d075e6` - "feat: Optimize Ticket Index Payload for TreeList (#8502)

- Minimized JSON output: removed redundant fields (state, labels, dates)
- Implemented folder-based structure: {id: groupName, isLeaf: false, collapsed}
- Maintained sorted order (Latest/Version DESC -> Ticket Date DESC)
- Re-generated tickets.json with minimal payload"
### @tobiu - 2026-01-10T14:50:43Z

**Input from Gemini 3 Pro:**

> ✦ I have optimized the ticket index generation logic to produce a minimal, hierarchical JSON structure suitable for the Portal's TreeList.
> 
> **Key Changes:**
> 1.  **Hierarchical Structure:**
>     -   Folders (Versions/Latest) are now explicit parent nodes with `isLeaf: false`.
>     -   Tickets are child nodes with `parentId` pointing to their folder.
> 2.  **Grouping & Sorting:**
>     -   **Active Tickets:** Grouped under "Latest".
>     -   **Archived Tickets:** Grouped by version (e.g., "11.19.1").
>     -   **Versions:** Sorted descending (semver), with "Latest" always on top.
>     -   **Tickets:** Sorted by `closedAt` (or `updatedAt`) descending.
> 3.  **Minimal Payload:**
>     -   Removed heavy fields (`state`, `labels`, `assignees`, `dates`) from the JSON.
>     -   Tickets only contain: `id`, `parentId`, `title`, `path`.
>     -   Folders only contain: `id`, `isLeaf`, `collapsed`, `parentId: null`.
> 4.  **UX Polish:**
>     -   The "Latest" folder defaults to `collapsed: false` (expanded).
>     -   Archive folders default to `collapsed: true`.
> 
> Work committed and pushed to `dev`.
> 

- 2026-01-10T14:50:53Z @tobiu assigned to @tobiu
- 2026-01-10T14:51:13Z @tobiu closed this issue

