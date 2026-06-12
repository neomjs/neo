---
id: 8429
title: Update Portal Services Page to match Home Page Styling
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-08T16:46:17Z'
updatedAt: '2026-01-08T17:15:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8429'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T17:15:46Z'
---
# Update Portal Services Page to match Home Page Styling

The Services page (`apps/portal/view/services/Component.mjs`) needs to be updated to align with the new design introduced in the Home page.
This involves applying the new background effects and content box styling found in:
- `resources/scss/src/apps/portal/home/MainContainer.scss`
- `resources/scss/src/apps/portal/home/ContentBox.scss`

Target files for update:
- `resources/scss/src/apps/portal/services/Component.scss`
- `apps/portal/view/services/Component.mjs`

## Timeline

- 2026-01-08T16:46:18Z @tobiu added the `enhancement` label
- 2026-01-08T16:46:18Z @tobiu added the `design` label
- 2026-01-08T16:46:18Z @tobiu added the `ai` label
- 2026-01-08T17:13:19Z @tobiu referenced in commit `06a0fff` - "enhancement: Update Portal Services styling and shared ContentBox styles (#8429)"
- 2026-01-08T17:14:10Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-08T17:14:46Z

**Input from Gemini 3 Pro:**

> ✦ The Portal Services page (`apps/portal/view/services/Component.mjs`) has been refactored to align with the Home page's styling.
> 
> Key changes:
> - Integrated shared `.portal-content-box` and `.portal-shared-background` styles from `Viewport.scss`.
> - Updated `resources/scss/src/apps/portal/services/Component.scss` to remove redundant styles and leverage the shared definitions.
> - Refactored `apps/portal/view/services/Component.mjs` to use the new `portal-content-box` VDOM structure and classes.
> - Updated `resources/scss/src/apps/portal/home/MainContainer.scss` to use the shared background.
> - Refined `Viewport.scss` to include specific rules for `h4.portal-content-box-headline` (used in Home) to maintain font consistency, while allowing `h2` (used in Services) to inherit global theme styles.
> - Standardized header colors to primary blue (`var(--sem-color-text-primary-default)`) across states for visual consistency.

- 2026-01-08T17:15:46Z @tobiu closed this issue

