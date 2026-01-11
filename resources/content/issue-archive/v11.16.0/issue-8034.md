---
id: 8034
title: Migrate Intervention Panel Styles and Clean Viewport SCSS
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-05T02:43:16Z'
updatedAt: '2025-12-05T02:47:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8034'
author: tobiu
commentsCount: 1
parentIssue: 7918
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-05T02:47:50Z'
---
# Migrate Intervention Panel Styles and Clean Viewport SCSS

Migrate the remaining intervention panel styles from `apps/agentos/Viewport.scss` to `apps/agentos/InterventionPanel.scss` and clean up obsolete code.

**Tasks:**
1.  **Migrate:** Move the specific panel styling (header colors, borders) from `.agent-panel-intervention` in `Viewport.scss` to `InterventionPanel.scss`.
2.  **Cleanup:** Remove the obsolete `.agent-terminal`, `.agent-log-entry`, and `.agent-log-timestamp` styles from `Viewport.scss` as these elements no longer exist (replaced by Grid).
3.  **Refactor:** Ensure the migrated styles use the new CSS variables where appropriate.

**Goal:**
Consolidate all intervention-related styling into its dedicated SCSS file and remove dead code.

## Timeline

- 2025-12-05T02:43:17Z @tobiu added the `ai` label
- 2025-12-05T02:43:17Z @tobiu added the `refactoring` label
- 2025-12-05T02:43:28Z @tobiu assigned to @tobiu
- 2025-12-05T02:43:35Z @tobiu added parent issue #7918
- 2025-12-05T02:47:26Z @tobiu referenced in commit `7636f3c` - "Migrate Intervention Panel Styles and Clean Viewport SCSS #8034"
### @tobiu - 2025-12-05T02:47:39Z

**Input from Gemini 2.5 pro:**

> ✦ I have successfully migrated the Intervention Panel styling and cleaned up the Viewport SCSS.
> 
> **Changes:**
> 1.  **Migration:** Moved panel-specific styles (background, borders, header accents) from `Viewport.scss` to `resources/scss/src/apps/agentos/InterventionPanel.scss`.
> 2.  **Cleanup:** Removed the obsolete `.agent-terminal` and related log entry styles from `Viewport.scss`.
> 3.  **Refactoring:** The migrated styles now correctly use the app-specific CSS variables (`--agent-bg-panel`, `--agent-accent-intervention`), ensuring they respond to the theme mapping.
> 
> The codebase is now cleaner and properly modularized.

- 2025-12-05T02:47:50Z @tobiu closed this issue

