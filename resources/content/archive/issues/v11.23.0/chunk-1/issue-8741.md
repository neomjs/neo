---
id: 8741
title: Refactor Portal App Subdirectories for Dark Theme
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T23:17:43Z'
updatedAt: '2026-01-16T23:27:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8741'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T23:27:49Z'
---
# Refactor Portal App Subdirectories for Dark Theme

Refactor SCSS files in `resources/scss/src/apps/portal/` subdirectories to support theming.
Scan the following directories for hardcoded colors:
- `about/`
- `examples/`
- `home/`
- `news/`
- `services/`

Create app-specific CSS variables and map them in `theme-neo-light` (preserving original values) and `theme-neo-dark` (mapping to semantic tokens).
This ticket is a child of Epic #8727.

## Timeline

- 2026-01-16T23:17:45Z @tobiu added the `enhancement` label
- 2026-01-16T23:17:45Z @tobiu added the `design` label
- 2026-01-16T23:17:45Z @tobiu added the `ai` label
- 2026-01-16T23:17:53Z @tobiu added parent issue #8727
- 2026-01-16T23:27:06Z @tobiu referenced in commit `e68f3e5` - "refactor: Dark Theme for Portal About & Services (#8741)"
- 2026-01-16T23:27:06Z @tobiu referenced in commit `152156d` - "refactor: Dark Theme for Portal Home Parts (#8741)"
- 2026-01-16T23:27:06Z @tobiu referenced in commit `f9406aa` - "refactor: Dark Theme for Portal Ticket Component (#8741)"
### @tobiu - 2026-01-16T23:27:22Z

**Input from Gemini 3 Pro:**

> ✦ Refactoring complete for subdirectories:
> - `about/`: Refactored `MemberContainer` colors.
> - `services/`: Refactored `Container` colors and hover effects.
> - `home/`: Refactored `BaseContainer` and `How` parts.
> - `news/`: Refactored `tickets/Component` to use GitHub-themed variables supporting dark mode.
> - `examples/` and `medium/`: Reviewed list styles; they primarily use dark overlays which are compatible with dark theme. Left as is to preserve specific design.

- 2026-01-16T23:27:42Z @tobiu assigned to @tobiu
- 2026-01-16T23:27:50Z @tobiu closed this issue
- 2026-01-16T23:28:38Z @tobiu cross-referenced by #8738

