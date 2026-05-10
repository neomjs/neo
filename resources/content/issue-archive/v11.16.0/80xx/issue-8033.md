---
id: 8033
title: Create InterventionPanel.scss and Fix Selection Contrast
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2025-12-05T02:18:56Z'
updatedAt: '2025-12-05T02:40:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8033'
author: tobiu
commentsCount: 1
parentIssue: 7918
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-05T02:40:28Z'
---
# Create InterventionPanel.scss and Fix Selection Contrast

Create the app-specific stylesheet for `AgentOS.view.InterventionPanel` and address contrast issues for the priority column during row selection.

**Requirements:**
1.  Refactor `InterventionPanel.mjs` to use CSS classes (`agent-priority-error`, `agent-priority-warning`) instead of inline styles for the priority renderer.
2.  Create `resources/scss/src/apps/agentos/InterventionPanel.scss` to define the base styles for these priority classes.
3.  Implement contrast fixes:
    -   Ensure `agent-priority-warning` (Orange) changes color (e.g., to Black or Dark Brown) when the parent row is `.neo-selected` (Cyan background) to maintain readability.

**Rationale:**
Inline styles cannot be easily overridden by CSS selection states. Using classes allows us to react to the `neo-selected` state of the grid row.

## Timeline

- 2025-12-05T02:18:57Z @tobiu added the `enhancement` label
- 2025-12-05T02:18:57Z @tobiu added the `design` label
- 2025-12-05T02:18:58Z @tobiu added the `ai` label
- 2025-12-05T02:19:06Z @tobiu added parent issue #7918
- 2025-12-05T02:20:08Z @tobiu assigned to @tobiu
- 2025-12-05T02:40:06Z @tobiu referenced in commit `062efd2` - "Create InterventionPanel.scss and Fix Selection Contrast #8033"
### @tobiu - 2025-12-05T02:40:15Z

**Input from Gemini 2.5 pro:**

> ✦ I have implemented the app-specific styling for the Intervention Panel, including contrast fixes for the Cyberpunk theme.
> 
> **Implementation Details:**
> 1.  **Refactored Renderer:** `InterventionPanel.mjs` now returns VDOM with classes (`.agent-priority-warning`) instead of inline styles.
> 2.  **Scoped Styles (`src`):** `resources/scss/src/apps/agentos/InterventionPanel.scss` defines the base styles within the `.agent-panel-intervention.neo-panel` scope and handles the selection state logic via variables.
> 3.  **Theme Variables:**
>     -   **Cyberpunk:** Sets selected state text to `#000` (Black) for high contrast against the Cyan background.
>     -   **Standard Themes:** Maintains original colors (Orange/Red) in both selected and unselected states (or matching defaults).
> 
> This ensures accessibility and visual consistency across themes.

- 2025-12-05T02:40:28Z @tobiu closed this issue

