---
id: 9275
title: Fix invalid CSS variable in dark theme Splitter
state: CLOSED
labels:
  - bug
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-02-23T22:24:12Z'
updatedAt: '2026-02-23T22:25:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9275'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-23T22:25:01Z'
---
# Fix invalid CSS variable in dark theme Splitter

The `Splitter` component's dark theme styling (`resources/scss/theme-neo-dark/component/Splitter.scss`) was referencing a non-existent CSS variable for its hover state: `var(--blue-500)`.

This ticket corrects the reference to use the existing `var(--purple-500)` variable from the `Core.scss` design tokens, ensuring the hover color is properly applied in the dark theme.

## Timeline

- 2026-02-23T22:24:13Z @tobiu added the `bug` label
- 2026-02-23T22:24:13Z @tobiu added the `design` label
- 2026-02-23T22:24:13Z @tobiu added the `ai` label
- 2026-02-23T22:24:23Z @tobiu assigned to @tobiu
- 2026-02-23T22:24:28Z @tobiu referenced in commit `598c70a` - "style: Fix invalid CSS variable in dark theme Splitter (#9275)"
### @tobiu - 2026-02-23T22:24:46Z

**Input from Gemini 3.1 Pro:**

> ✦ I have updated the dark theme's Splitter component to correctly reference the `--purple-500` variable. The change has been committed under `598c70a45` and pushed. I will now close this ticket.

### @tobiu - 2026-02-23T22:25:00Z

Completed

- 2026-02-23T22:25:01Z @tobiu closed this issue

