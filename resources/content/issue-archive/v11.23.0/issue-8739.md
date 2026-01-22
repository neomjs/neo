---
id: 8739
title: Implement Dark Theme for Portal Content Components
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T22:57:21Z'
updatedAt: '2026-01-16T23:14:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8739'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T23:14:56Z'
---
# Implement Dark Theme for Portal Content Components

Refactor Portal App content components to support theming, focusing on removing hardcoded colors while preserving the exact light theme appearance.

**Tasks**:
1.  **Refactor `SectionsContainer.scss`**:
    *   Replace hardcoded colors (`#fff`, `lightgray`, `#000`) with app-specific CSS variables.
    *   Example: `--portal-sections-bg`, `--portal-sections-shadow`, `--portal-sections-glyph-color`.
2.  **Define Light Theme Variables**:
    *   Create `resources/scss/theme-neo-light/apps/portal/shared/content/SectionsContainer.scss`.
    *   Set variables to the original hex values (e.g., `#fff`).
    *   **CRITICAL**: Ensure zero visual regression for the light theme.
3.  **Define Dark Theme Variables**:
    *   Create `resources/scss/theme-neo-dark/apps/portal/shared/content/SectionsContainer.scss`.
    *   Map variables to semantic tokens (e.g., `var(--sem-color-bg-neutral-default)`).
4.  **Verify `TreeList.scss`**:
    *   Ensure `var(--list-item-background-color)` and `var(--list-item-glyph-color)` are correctly mapped in the dark theme context, or refactor if they are leaking from a generic list style that doesn't fit.
5.  **Scan for other files**:
    *   Check `src/apps/portal/shared/content/` for other hardcoded values.

This ticket is a child of Epic #8727.

## Timeline

- 2026-01-16T22:57:22Z @tobiu added the `enhancement` label
- 2026-01-16T22:57:23Z @tobiu added the `design` label
- 2026-01-16T22:57:23Z @tobiu added the `ai` label
- 2026-01-16T22:57:30Z @tobiu added parent issue #8727
- 2026-01-16T23:13:33Z @tobiu referenced in commit `221626f` - "refactor: Implement Dark Theme for Portal Content Components (#8739)"
### @tobiu - 2026-01-16T23:14:39Z

**Input from Gemini 3 Pro:**

> ✦ Refactoring complete.
> 
> **Changes:**
> 1.  **`SectionsContainer.scss`**: Extracted background, button colors, and shadows to CSS variables.
>     *   Light Theme: Preserved `#fff`, `lightgray`, `rgba(0,0,0,.3)` etc.
>     *   Dark Theme: Mapped to semantic tokens (`--sem-color-bg-neutral-default`, etc.).
> 2.  **`Container.scss`**: Extracted sidenav button background and shadow.
> 3.  **`PageContainer.scss`**: Extracted toolbar button background and text color.
> 4.  **`TreeList.scss`**: Verified it uses standard list variables which are correctly mapped in the dark theme.
> 
> **Files Created:**
> *   `resources/scss/theme-neo-light/apps/portal/shared/content/SectionsContainer.scss`
> *   `resources/scss/theme-neo-dark/apps/portal/shared/content/SectionsContainer.scss`
> *   `resources/scss/theme-neo-light/apps/portal/shared/content/Container.scss`
> *   `resources/scss/theme-neo-dark/apps/portal/shared/content/Container.scss`
> *   `resources/scss/theme-neo-light/apps/portal/shared/content/PageContainer.scss`
> *   `resources/scss/theme-neo-dark/apps/portal/shared/content/PageContainer.scss`
> 
> **Files Modified:**
> *   `resources/scss/src/apps/portal/shared/content/SectionsContainer.scss`
> *   `resources/scss/src/apps/portal/shared/content/Container.scss`
> *   `resources/scss/src/apps/portal/shared/content/PageContainer.scss`

- 2026-01-16T23:14:51Z @tobiu assigned to @tobiu
- 2026-01-16T23:14:57Z @tobiu closed this issue
- 2026-01-16T23:28:38Z @tobiu cross-referenced by #8738

