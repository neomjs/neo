---
id: 8034
title: Migrate Intervention Panel Styles and Clean Viewport SCSS
state: OPEN
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-05T02:43:16Z'
updatedAt: '2025-12-05T02:43:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8034'
author: tobiu
commentsCount: 0
parentIssue: 7918
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Migrate Intervention Panel Styles and Clean Viewport SCSS

Migrate the remaining intervention panel styles from `apps/agentos/Viewport.scss` to `apps/agentos/InterventionPanel.scss` and clean up obsolete code.

**Tasks:**
1.  **Migrate:** Move the specific panel styling (header colors, borders) from `.agent-panel-intervention` in `Viewport.scss` to `InterventionPanel.scss`.
2.  **Cleanup:** Remove the obsolete `.agent-terminal`, `.agent-log-entry`, and `.agent-log-timestamp` styles from `Viewport.scss` as these elements no longer exist (replaced by Grid).
3.  **Refactor:** Ensure the migrated styles use the new CSS variables where appropriate.

**Goal:**
Consolidate all intervention-related styling into its dedicated SCSS file and remove dead code.

## Activity Log

- 2025-12-05 @tobiu added the `ai` label
- 2025-12-05 @tobiu added the `refactoring` label
- 2025-12-05 @tobiu assigned to @tobiu
- 2025-12-05 @tobiu added parent issue #7918

