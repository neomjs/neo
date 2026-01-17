---
id: 8754
title: Implement Theme-Aware Mermaid Diagram Rendering
state: OPEN
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-17T06:08:51Z'
updatedAt: '2026-01-17T06:09:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8754'
author: tobiu
commentsCount: 0
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

