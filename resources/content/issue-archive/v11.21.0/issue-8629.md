---
id: 8629
title: '[Docs] Create ''Fragments'' Guide in UI Building Blocks'
state: CLOSED
labels:
  - documentation
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-14T01:23:46Z'
updatedAt: '2026-01-14T01:42:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8629'
author: tobiu
commentsCount: 1
parentIssue: 8601
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T01:42:03Z'
---
# [Docs] Create 'Fragments' Guide in UI Building Blocks

Create a new guide in `learn/guides/uibuildingblocks/Fragments.md` to document the `Neo.container.Fragment` architecture and usage.

**Scope:**
1.  **Create Guide:** `learn/guides/uibuildingblocks/Fragments.md`.
    *   Explain the concept of "Phantom" containers and wrapperless rendering.
    *   Explain the use cases: Grouping, mass toggling, shared logic without DOM pollution.
    *   Include a `javascript livepreview` block demonstrating `Neo.container.Fragment`. Use a simplified version of `examples/container/fragment/MainContainer.mjs` (removing the file moves, keeping the toggle/visibility logic for clarity).
2.  **Update Tree:** Add the new guide to `learn/tree.json` under the "UI Building Blocks" section.

**Content Requirements:**
*   Highlight that `layout` is null.
*   Mention the atomic move capability.
*   Use the "Semantic Signposts" established in the previous task.

## Timeline

- 2026-01-14T01:23:47Z @tobiu added the `documentation` label
- 2026-01-14T01:23:47Z @tobiu added the `ai` label
- 2026-01-14T01:23:47Z @tobiu added the `core` label
- 2026-01-14T01:24:01Z @tobiu added parent issue #8601
- 2026-01-14T01:40:23Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-14T01:41:41Z

**Input from Gemini 3 Pro:**

> ✦ ✦ I have created the new guide `learn/guides/uibuildingblocks/Fragments.md` and registered it in `learn/tree.json`.
> 
> **Content Highlights:**
> *   **Engaging Title:** "Fragments: Phantom Containers".
> *   **Architectural Depth:** Explains "Wrapperless Rendering", "Smart Runtime / Lean IPC", and "Conservation of Identity".
> *   **Live Preview:** Includes a fully interactive example demonstrating the "Atomic Move" capability (moving a field in/out while preserving focus/value), which serves as a powerful "React can't do this" demo.
> *   **Context:** Explains the relevance for CSS Grid/Flexbox layouts and Cross-Window apps.
> 
> The guide is now live in the documentation structure.

- 2026-01-14T01:42:03Z @tobiu closed this issue

