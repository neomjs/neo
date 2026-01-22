---
id: 8737
title: Implement Dark Theme for Application Styles
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T21:59:45Z'
updatedAt: '2026-01-16T22:03:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8737'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T22:03:40Z'
---
# Implement Dark Theme for Application Styles

Implement dark theme support for Application-specific styles by updating the corresponding SCSS files in `resources/scss/theme-neo-dark/apps`.

**Apps:**
- `portal/`
- `docs/`
- `agentos/`
- `covid/`

**Tasks:**
1.  Update the SCSS files to use inverted semantic tokens and ensure dark mode consistency.
2.  Ensure visual hierarchy and contrast are maintained in dark mode.

This task is part of Epic #8727.

## Timeline

- 2026-01-16T21:59:46Z @tobiu added the `enhancement` label
- 2026-01-16T21:59:46Z @tobiu added the `design` label
- 2026-01-16T21:59:46Z @tobiu added the `ai` label
- 2026-01-16T21:59:53Z @tobiu added parent issue #8727
- 2026-01-16T22:02:39Z @tobiu referenced in commit `5d97e8b` - "feat: Implement Dark Theme for Apps (Portal, Docs, AgentOS, Covid) (#8737)"
- 2026-01-16T22:02:58Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-16T22:03:20Z

**Input from Gemini 3 Pro:**

> ✦ Completed implementation of dark theme support for Application-specific styles.
> 
> **Changes:**
> 1.  **Portal (`apps/portal/`)**:
>     - Updated `services/Container.scss` with dark glass effect variables (rgba on black) and inverted link colors.
>     - `news/medium` and `Viewport` verified.
> 2.  **AgentOS (`apps/agentos/`)**:
>     - `Viewport.scss`: Inverted GitHub-inspired color variables (`agent-bg-dark`, `agent-text-primary`, etc.) for true dark mode.
>     - `InterventionPanel.scss`: Verified.
> 3.  **Docs (`apps/docs/`)**:
>     - Updated all container and component styles (`MainContainer`, `HeaderContainer`, `MembersList`, etc.) to use dark semantic tokens (`bg-neutral-default`, `text-neutral-default`).
>     - Adjusted `MembersList.scss` to use subtle backgrounds and inverted text for hierarchy.
> 4.  **Covid (`apps/covid/`)**:
>     - `HeaderContainer.scss`: Adjusted RGBA backgrounds for lower opacity and lightened text colors for contrast on dark backgrounds.
>     - Updated `Gallery`, `LineChart`, and `Helix` to use standard dark theme tokens.
> 
> All application overrides are now dark-mode compatible.

- 2026-01-16T22:03:40Z @tobiu closed this issue
- 2026-01-16T22:22:33Z @tobiu cross-referenced by #8727

