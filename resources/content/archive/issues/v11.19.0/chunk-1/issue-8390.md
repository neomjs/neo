---
id: 8390
title: Implement Tree-Structured Release Index and Portal Integration
state: CLOSED
labels:
  - documentation
  - enhancement
  - build
assignees:
  - tobiu
createdAt: '2026-01-07T18:08:18Z'
updatedAt: '2026-01-07T18:50:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8390'
author: tobiu
commentsCount: 1
parentIssue: 8362
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-07T18:33:29Z'
---
# Implement Tree-Structured Release Index and Portal Integration

Refactor `buildScripts/createReleaseIndex.mjs` to generate a hierarchical (flat-tree) JSON structure for `apps/portal/resources/data/releases.json` to be used by `TreeList` components.

**Requirements:**
1.  **Data Structure:** The output JSON should remain a flat array but include `id`, `parentId`, and `isLeaf` properties to define a hierarchy (similar to `learn/tree.json`).
2.  **Grouping:** Group releases by their Major version (e.g., "v11", "v10").
    *   Create parent nodes for each major version (e.g., `id: 'v11'`, `name: 'v11'`, `isLeaf: false`, `parentId: null`).
    *   Child release nodes should point to their major version parent (e.g., `parentId: 'v11'`).
3.  **Sorting:**
    *   Major versions should be sorted Descending (newest first).
    *   Releases within a version should be sorted Descending.
4.  **Default State:**
    *   The *latest* Major version node should be expanded (`expanded: true`).
    *   All older Major version nodes should be collapsed (`expanded: false` or omitted).
5.  **Store/Model Updates:**
    *   Verify and update `apps/portal/store/Releases.mjs` and `apps/portal/model/Release.mjs` to ensure they correctly consume this structured data.

**Affected Files:**
*   `buildScripts/createReleaseIndex.mjs`
*   `apps/portal/resources/data/releases.json` (Generated)
*   `apps/portal/store/Releases.mjs`
*   `apps/portal/model/Release.mjs`


## Timeline

- 2026-01-07T18:08:19Z @tobiu added the `documentation` label
- 2026-01-07T18:08:19Z @tobiu added the `enhancement` label
- 2026-01-07T18:08:19Z @tobiu added the `build` label
- 2026-01-07T18:11:27Z @tobiu assigned to @tobiu
- 2026-01-07T18:11:50Z @tobiu added parent issue #8362
- 2026-01-07T18:33:07Z @tobiu referenced in commit `429c414` - "feat(portal): Implement tree-structured releases index and integration (#8390)

Refactor build script to generate hierarchical release data grouped by major version. Update Release store and model to support tree structure."
- 2026-01-07T18:33:29Z @tobiu closed this issue
### @tobiu - 2026-01-07T18:50:44Z

**Input from Gemini 3 Pro:**

> ✦ Task completed.
> 
> Refactored `buildScripts/createReleaseIndex.mjs` to generate a hierarchical (flat-tree) JSON structure for releases, grouped by major version.
> - **Parent Nodes:** Created for major versions (e.g., `v11`).
> - **Sorting:** Descending order for both major versions and releases.
> - **Default State:** Latest major version is expanded; others are collapsed.
> - **Model/Store:** Updated `Portal.model.Release` and `Portal.store.Releases` to support the new schema.
> 
> Verified functionality via Neural Link: The TreeList in the Portal correctly displays the grouped releases.


