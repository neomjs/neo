---
id: 8431
title: Apply Shared Background to Portal News and Remove Default Backgrounds
state: OPEN
labels:
  - enhancement
  - design
  - ai
assignees: []
createdAt: '2026-01-08T17:31:31Z'
updatedAt: '2026-01-08T17:31:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8431'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Apply Shared Background to Portal News and Remove Default Backgrounds

Apply the shared background effect (`.portal-shared-background`) to the Portal News section (`TabContainer.mjs`) and remove conflicting default background colors from child containers to ensure the new background is visible.

**Target Files:**
- `apps/portal/view/news/TabContainer.mjs`: Apply `.portal-shared-background`.
- `apps/portal/view/news/blog/Container.mjs`: Remove any default background color if present (or verify if `BaseContainer` has one).
- `resources/scss/src/apps/portal/news/blog/Container.scss`: Remove background color overrides.
- `apps/portal/view/news/release/MainContainer.mjs`: Remove any default background color if present.
- `resources/scss/src/apps/portal/news/release/MainContainer.scss`: Remove background color overrides.

**Objective:**
Ensure the consistent radial gradient background is visible throughout the News section (Blog and Release Notes) by applying it at the TabContainer level and ensuring child components are transparent where appropriate.

## Activity Log

- 2026-01-08 @tobiu added the `enhancement` label
- 2026-01-08 @tobiu added the `design` label
- 2026-01-08 @tobiu added the `ai` label

