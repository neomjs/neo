---
id: 8788
title: Refine Portal News TreeList Dark Theme Styling
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-18T19:15:47Z'
updatedAt: '2026-01-18T19:33:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8788'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-18T19:33:11Z'
---
# Refine Portal News TreeList Dark Theme Styling

**Objective:** Refine the visual hierarchy of the TreeList navigation in the Portal App's News section (Releases, Tickets, Blog) for the Dark Theme.

**Decision:**
Use `var(--white-off)` (#ddddee) for secondary content instead of opacity to ensure visual consistency with Markdown content.

**Tasks:**
1.  **Ticket Model Update**:
    *   Modify `apps/portal/model/Ticket.mjs` to wrap the ticket title in a `<span>` with a class (`.ticket-title`).
2.  **TreeList SCSS Update**:
    *   Update `resources/scss/src/apps/portal/shared/content/TreeList.scss`.
    *   **Remove** `opacity: 0.8` from `.release-date` and `.blog-date`.
    *   Introduce CSS variables for colors to support theming.
3.  **Dark Theme Implementation**:
    *   Create `resources/scss/theme-neo-dark/apps/portal/shared/content/TreeList.scss`.
    *   Set `.release-date`, `.blog-date`, and `.ticket-title` to use `var(--white-off)`.
    *   Ensure bold elements (ID, Version) retain the standard bright text color.

## Timeline

- 2026-01-18T19:15:48Z @tobiu added the `enhancement` label
- 2026-01-18T19:15:48Z @tobiu added the `design` label
- 2026-01-18T19:15:48Z @tobiu added the `ai` label
- 2026-01-18T19:32:22Z @tobiu referenced in commit `d00906b` - "style: Refine Portal News TreeList Dark Theme Styling (#8788)

Refactor TreeList SCSS to use CSS variables for theming. Apply var(--white-off) for secondary content (dates, ticket titles) in Dark Theme. Unify secondary content color in Light Theme to rgba(0,0,0,0.8). Wrap ticket titles in span.ticket-title and align styling (font-size, margins) with release dates for consistency."
### @tobiu - 2026-01-18T19:32:40Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the Dark Theme styling refinements for the Portal News TreeList (Releases, Tickets, Blog).
> 
> **Changes:**
> 1.  **Ticket Model (`apps/portal/model/Ticket.mjs`):**
>     *   Wrapped the ticket title in a `<span class="ticket-title">` to allow for independent styling from the bold ID, matching the structure of Releases.
> 
> 2.  **TreeList SCSS (`resources/scss/src/apps/portal/shared/content/TreeList.scss`):**
>     *   Refactored `.release-date`, `.blog-date`, and the new `.ticket-title` to use CSS variables for color.
>     *   **Unified Styling:** Applied `font-size: 90%`, `margin-left: 5px`, `position: relative`, and `top: -1px` to `.ticket-title` so it visually matches the rendering of release dates.
>     *   **Removed Opacity:** Removed `opacity: 0.8` from `.release-date` and `.blog-date` in favor of explicit color values.
> 
> 3.  **Theme Definitions:**
>     *   **Dark Theme (`theme-neo-dark`):**
>         *   Mapped meta content (dates, ticket titles) to `var(--white-off)` (#ddddee).
>         *   Bold identifiers (ID, Version) inherit the default bright text color.
>     *   **Light Theme (`theme-neo-light`):**
>         *   Mapped meta content to `rgba(0, 0, 0, 0.8)` to preserve the original visual hierarchy.
> 
> The result is a consistent, themable list presentation across all three content types.

- 2026-01-18T19:32:49Z @tobiu assigned to @tobiu
- 2026-01-18T19:32:57Z @tobiu added parent issue #8727
- 2026-01-18T19:33:11Z @tobiu closed this issue

