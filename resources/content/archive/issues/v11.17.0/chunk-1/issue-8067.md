---
id: 8067
title: Create Neo.component.Markdown for Encapsulated Markdown Rendering
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-09T12:29:43Z'
updatedAt: '2025-12-09T13:55:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8067'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-09T13:55:29Z'
---
# Create Neo.component.Markdown for Encapsulated Markdown Rendering

Implement a dedicated `Neo.component.Markdown` component to encapsulate Markdown rendering logic and styling, promoting reuse and consistency across `LivePreview` and `ContentComponent`.

**Scope:**
1.  **Create `src/component/Markdown.mjs`**:
    *   **Config**: `ntype: 'markdown'`, reactive `value_` (markdown string).
    *   **Logic**: Uses `MarkdownRenderer` internally. When `value` changes, delegates rendering to the renderer.
    *   **Lifecycle**: Delegates `destroy()` to `renderer.destroyComponents()`.
    *   **Styling**: Move styles from `ContentComponent.scss` to a new `src/component/Markdown.scss` (or similar shared location) and apply them here.

2.  **Refactor `LivePreview.mjs`**:
    *   When `language` is `'markdown'`, instantiate `Neo.component.Markdown` inside the preview container instead of using the renderer directly on the container.
    *   Bind the editor value to the markdown component's `value`.

3.  **Refactor `ContentComponent.mjs`**:
    *   Extend `Neo.component.Markdown` instead of `Neo.component.Base`.
    *   Inherit the rendering and styling logic.
    *   Retain specific Portal logic (fetching, routing, intersection observer).

**Goal:**
Decouple styling from the view and logic from the renderer, creating a self-contained Markdown component that can be used anywhere (e.g., LivePreview, Dashboards).

**Note:** This ticket focuses on the component creation and integration. Consolidating logic from `MarkdownRenderer` into the component itself is out of scope for this task and will be considered later.

## Timeline

- 2025-12-09T12:29:44Z @tobiu added the `enhancement` label
- 2025-12-09T12:29:44Z @tobiu added the `ai` label
- 2025-12-09T12:29:45Z @tobiu added the `refactoring` label
- 2025-12-09T12:29:45Z @tobiu added the `architecture` label
- 2025-12-09T12:29:58Z @tobiu assigned to @tobiu
- 2025-12-09T13:35:29Z @tobiu referenced in commit `6026b5c` - "Create Neo.component.Markdown for Encapsulated Markdown Rendering #8067"
- 2025-12-09T13:55:29Z @tobiu closed this issue

