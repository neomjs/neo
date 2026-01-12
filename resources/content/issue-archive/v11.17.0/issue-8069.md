---
id: 8069
title: Refactor Renderer Architecture and Consolidate Markdown Logic
state: CLOSED
labels:
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-09T14:27:58Z'
updatedAt: '2025-12-09T14:55:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8069'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-09T14:55:05Z'
---
# Refactor Renderer Architecture and Consolidate Markdown Logic

The current `src/code/renderer/` hierarchy is an abstraction that doesn't fit the actual usage patterns. The `Base` renderer logic is entirely specific to Markdown component management, while the `Neo` renderer is a simple code executor.

This ticket aims to simplify the architecture by:
1.  **Merging `src/code/renderer/Markdown.mjs` into `src/component/Markdown.mjs`**: The component should own the rendering logic directly.
2.  **Deleting `src/code/renderer/Markdown.mjs`**: It will be obsolete.
3.  **Deleting `src/code/renderer/Base.mjs`**: Its purpose vanishes with the removal of the Markdown renderer.
4.  **Refactoring `src/code/LivePreview.mjs`**:
    -   Remove the "renderer" abstraction/loading logic.
    -   Directly use `Neo.component.Markdown` for markdown content.
    -   Update how `NeoRenderer` (or its successor) is used for Neo code execution.
5.  **Renaming/Refactoring `src/code/renderer/Neo.mjs`**: It should likely become a standalone helper (e.g., `src/util/NeoCodeExecutor.mjs` or similar) since it no longer needs to be part of a "renderer" class hierarchy.

**Goal:** Remove the leaky "renderer" abstraction, simplify `LivePreview`, and fully encapsulate markdown logic within its component.

## Timeline

- 2025-12-09T14:27:59Z @tobiu added the `ai` label
- 2025-12-09T14:28:00Z @tobiu added the `refactoring` label
- 2025-12-09T14:28:00Z @tobiu added the `architecture` label
- 2025-12-09T14:31:42Z @tobiu assigned to @tobiu
- 2025-12-09T14:54:52Z @tobiu referenced in commit `f3f3abe` - "Refactor Renderer Architecture and Consolidate Markdown Logic #8069"
- 2025-12-09T14:55:05Z @tobiu closed this issue

