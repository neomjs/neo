---
id: 8603
title: VDOM Helper Support for Fragment Indexing & Deltas
state: OPEN
labels:
  - ai
  - core
  - feature
assignees:
  - tobiu
createdAt: '2026-01-13T14:52:55Z'
updatedAt: '2026-01-13T15:18:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8603'
author: tobiu
commentsCount: 0
parentIssue: 8601
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# VDOM Helper Support for Fragment Indexing & Deltas

Part of Epic #8601.

**Goal:** Update `src/vdom/Helper.mjs` to handle `tag: 'fragment'` correctly during index calculation and delta generation.

**Architectural Decision:**
We are following a **"Smart Runtime / Lean IPC"** strategy. The VDOM Helper should NOT "compile away" fragments into individual node operations. Instead, it must generate high-level "Fragment Deltas" (e.g., `{action: 'moveNode', id: fragmentId}`) and rely on `Neo.main.DeltaUpdates` to handle the physical DOM range manipulation. This minimizes IPC traffic.

**Tasks:**
1.  **Update `getPhysicalIndex`**:
    *   Logic must be generalized. Currently, it accounts for text nodes (1 logical = 3 physical).
    *   It must now account for Fragments (1 logical = N physical, where N is the recursive count of the Fragment's rendered children + anchors).
2.  **Update `createDeltas`**:
    *   Ensure `compareAttributes` ignores attributes/styles for fragments (or warns).
    *   Ensure standard diffing logic generates `insert/move/remove` deltas for the Fragment node itself, not its constituents.

## Timeline

- 2026-01-13T14:52:56Z @tobiu added the `ai` label
- 2026-01-13T14:52:56Z @tobiu added the `core` label
- 2026-01-13T14:52:56Z @tobiu added the `feature` label
- 2026-01-13T14:53:37Z @tobiu added parent issue #8601
- 2026-01-13T15:17:35Z @tobiu cross-referenced by #8601
- 2026-01-13T15:18:23Z @tobiu assigned to @tobiu

