---
id: 8754
title: Implement Theme-Aware Mermaid Diagram Rendering
state: CLOSED
labels:
  - enhancement
  - epic
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-17T06:08:51Z'
updatedAt: '2026-01-17T10:44:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8754'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-17T10:44:14Z'
---
# Implement Theme-Aware Mermaid Diagram Rendering

Implement theme-aware rendering for Mermaid diagrams to ensure legibility in both Light and Dark modes.

**Problem:**
Mermaid diagrams currently render with default (light) styling, which is illegible in Dark Mode (e.g., dark text on dark background, or harsh white backgrounds). Mermaid does not automatically adapt to CSS background changes.

**Requirements:**
1.  **Theme Detection:** The `Neo.main.addon.Mermaid` (Main Thread) must be aware of the current application theme.
2.  **Configuration:** Pass the appropriate theme config (e.g., `{ theme: 'dark' }`) to Mermaid during initialization or execution.
3.  **Re-rendering:** Implement logic to re-render diagrams when the application theme switches dynamically.
4.  **Markdown Integration:** Ensure `Neo.component.Markdown` correctly propagates the theme state to the addon.

## Timeline

- 2026-01-17T06:08:52Z @tobiu added the `enhancement` label
- 2026-01-17T06:08:52Z @tobiu added the `design` label
- 2026-01-17T06:08:52Z @tobiu added the `ai` label
- 2026-01-17T06:09:01Z @tobiu added parent issue #8727
- 2026-01-17T06:09:03Z @tobiu assigned to @tobiu
- 2026-01-17T09:47:34Z @tobiu added the `epic` label
- 2026-01-17T09:54:00Z @tobiu referenced in commit `9d354e8` - "feat: Implement theme-aware Mermaid diagram rendering (#8754)"
### @tobiu - 2026-01-17T09:54:06Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented theme-aware rendering for Mermaid diagrams.
> 
> **Changes:**
> 1.  **`Neo.main.addon.Mermaid`**:
>     -   Added a `themeMap` to map Neo themes (`neo-theme-dark`, etc.) to Mermaid themes (`dark`, `neutral`, etc.).
>     -   Added logic to `render()` to detect theme changes and re-initialize `mermaid.js` only when the mapped theme changes.
> 
> 2.  **`Neo.component.wrapper.Mermaid`**:
>     -   Implemented `afterSetTheme` to trigger a re-render when the component's theme changes.
>     -   Updated `render()` to pass the current Neo theme to the addon.
> 
> 3.  **`Neo.component.Markdown`**:
>     -   Implemented `afterSetTheme` to re-process the markdown content (and thus re-render Mermaid blocks) upon theme switch.
>     -   Updated the Mermaid rendering block to pass the current Neo theme to the addon.
> 
> **Outcome:**
> Mermaid diagrams will now automatically adapt to the application's theme, ensuring legibility in both Light and Dark modes. The mapping logic is centralized in the addon for consistency.

- 2026-01-17T10:33:52Z @tobiu referenced in commit `c1d5df4` - "docs: Enhance Mermaid Addon JSDoc with Knowledge Base Strategy (#8754)"
- 2026-01-17T10:41:25Z @tobiu referenced in commit `d1a4eec` - "docs: Refine Markdown Component JSDoc to reflect unified lazy loading strategy (#8754)"
- 2026-01-17T10:44:14Z @tobiu closed this issue

