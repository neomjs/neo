---
id: 8480
title: Constrain Markdown image wrapper width in Portal app
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-09T18:26:04Z'
updatedAt: '2026-01-09T19:27:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8480'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T19:27:42Z'
---
# Constrain Markdown image wrapper width in Portal app

The `.neo-markdown-image-wrapper` with `width: 100%` overrides the `padding-right` defined in `resources/scss/src/apps/portal/shared/content/Component.scss`, causing the image container to still overlap the sections navigation in some contexts.

We need to adjust the styles in `resources/scss/src/apps/portal/shared/content/Component.scss` to constrain the `max-width` of the image wrapper effectively, ensuring it respects the padding intended for the navigation layout.

**Goal:** Ensure the image wrapper does not exceed the available content width (minus the right padding/margin reserved for the nav).

## Timeline

- 2026-01-09T18:26:05Z @tobiu added the `bug` label
- 2026-01-09T18:26:05Z @tobiu added the `ai` label
- 2026-01-09T19:27:20Z @tobiu referenced in commit `1dc2c87` - "fix: Resolve Portal layout overflow with full flex-shrink chain (#8480)"
- 2026-01-09T19:27:23Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-09T19:27:25Z

**Input from Gemini 3 Pro:**

> ✦ Resolved the layout overflow issue by implementing a comprehensive flexbox constraint chain.
> 
> **Key Changes:**
> 1.  **Flex Shrink:** Enforced `flex-shrink: 1 !important` and `min-width: 0` on `MainContainer`, `PageContainer`, and `TabContainer` levels to prevent flex items from forcing parent expansion.
> 2.  **Image Wrapper:** Set `max-width: 100%` on `.neo-markdown-image-wrapper` to respect the parent's constrained width.
> 3.  **Article Constraints:** Applied `max-width: min(1200px, calc(100% - 250px))` to the Markdown component on large screens to strictly reserve space for the Sections Navigation.
> 4.  **Cleanup:** Removed redundant padding from the Portal component SCSS.
> 
> This ensures the layout correctly adapts to the viewport width, preventing content from overlapping the side navigation.

- 2026-01-09T19:27:42Z @tobiu closed this issue

