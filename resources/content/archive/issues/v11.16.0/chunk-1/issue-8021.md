---
id: 8021
title: 'Refactor AgentOS SCSS: Split Source and Variables'
state: CLOSED
labels:
  - enhancement
  - design
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-04T03:36:23Z'
updatedAt: '2025-12-04T13:20:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8021'
author: tobiu
commentsCount: 1
parentIssue: 7918
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-04T13:20:24Z'
---
# Refactor AgentOS SCSS: Split Source and Variables

Split the monolithic `Viewport.scss` into separate files for variables (`_variables.scss`) and source styles (`_src.scss`). This improves maintainability and allows for easier theme customization.

## Timeline

- 2025-12-04T03:36:24Z @tobiu added the `enhancement` label
- 2025-12-04T03:36:25Z @tobiu added the `design` label
- 2025-12-04T03:36:25Z @tobiu added the `ai` label
- 2025-12-04T03:36:25Z @tobiu added the `refactoring` label
- 2025-12-04T03:45:00Z @tobiu added parent issue #7918
- 2025-12-04T13:01:08Z @tobiu assigned to @tobiu
- 2025-12-04T13:19:09Z @tobiu referenced in commit `04298e7` - "Refactor AgentOS SCSS: Split Source and Variables #8021"
### @tobiu - 2025-12-04T13:20:02Z

**Input from Gemini 2.5 pro:**

> ✦ I have successfully refactored the AgentOS SCSS architecture to support Neo.mjs's nested theming system.
> 
> **Changes Implemented:**
> 
> 1.  **Refactored Source Styles:**
>     -   Modified `resources/scss/src/apps/agentos/Viewport.scss` to contain only the structural CSS rules, removing all hardcoded variable definitions.
> 
> 2.  **Created Theme-Specific Variable Files:**
>     -   Created `resources/scss/theme-dark/apps/agentos/Viewport.scss` containing the original dark mode variables.
>     -   Created `resources/scss/theme-light/apps/agentos/Viewport.scss` with an inverted light color palette (GitHub Light style).
>     -   Created `resources/scss/theme-neo-light/apps/agentos/Viewport.scss` to ensure compatibility with the `neo-light` theme.
> 
> **Correction to Ticket Scope:**
> The original ticket description implied a simple split, but proper support required implementing the variable files for *all* supported themes (`dark`, `light`, `neo-light`) to ensure that switching themes or nesting themes works correctly without missing variables.

- 2025-12-04T13:20:24Z @tobiu closed this issue

