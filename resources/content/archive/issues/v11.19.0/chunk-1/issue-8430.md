---
id: 8430
title: Refactor Portal About Page to use Shared Styling
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-08T17:19:42Z'
updatedAt: '2026-01-08T17:26:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8430'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T17:26:35Z'
---
# Refactor Portal About Page to use Shared Styling

Update `Portal.view.about.Container` and `Portal.view.about.MemberContainer` to match the new styling of Home and Services.

**Objectives:**
1.  **Shared Background:** Add `portal-shared-background` to `apps/portal/view/about/Container.mjs` to apply the consistent radial gradient background.
2.  **Shared Content Box:**
    -   Update `apps/portal/view/about/MemberContainer.mjs` to adopt the `portal-content-box` class.
    -   Update the `h2` tag class to `portal-content-box-headline` to inherit the consistent headline styling.
3.  **SCSS Cleanup:**
    -   Refactor `resources/scss/src/apps/portal/about/MemberContainer.scss` to remove redundant styles (border, border-radius, box-shadow) that are now provided by the shared `portal-content-box` class.
    -   Remove hardcoded colors and ensure use of CSS variables where appropriate.

**Target Files:**
- `apps/portal/view/about/Container.mjs`
- `apps/portal/view/about/MemberContainer.mjs`
- `resources/scss/src/apps/portal/about/MemberContainer.scss`

## Timeline

- 2026-01-08T17:19:43Z @tobiu added the `enhancement` label
- 2026-01-08T17:19:43Z @tobiu added the `design` label
- 2026-01-08T17:19:44Z @tobiu added the `ai` label
- 2026-01-08T17:25:11Z @tobiu referenced in commit `e8d5297` - "enhancement: Refactor Portal About Page to use Shared Styling (#8430)"
- 2026-01-08T17:25:59Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-08T17:26:12Z

**Input from Gemini 3 Pro:**

> ✦ The Portal About Page has been refactored to align with the new shared styling of the Home and Services pages.
> 
> **Changes:**
> - **Shared Background:** Added `portal-shared-background` to `apps/portal/view/about/Container.mjs`, enabling the consistent radial gradient background.
> - **Shared Content Styling:**
>     - Updated `apps/portal/view/about/MemberContainer.mjs` to include the `portal-content-box` class.
>     - Applied `portal-content-box-headline` to the member name header for consistent typography and color.
> - **SCSS Cleanup:**
>     - Refactored `resources/scss/src/apps/portal/about/MemberContainer.scss` to remove redundant border, border-radius, and box-shadow styles, deferring to the shared `.portal-content-box` definition.
>     - Removed hardcoded colors in favor of the shared variables/classes.

- 2026-01-08T17:26:36Z @tobiu closed this issue

