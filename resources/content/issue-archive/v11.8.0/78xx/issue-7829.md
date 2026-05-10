---
id: 7829
title: Optimize Stylesheet addon for SSR mode
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-20T21:02:42Z'
updatedAt: '2025-11-20T21:06:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7829'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-20T21:06:42Z'
---
# Optimize Stylesheet addon for SSR mode

Optimize `Neo.main.addon.Stylesheet` for Server-Side Rendering (SSR) mode.

**Context:**
When `Neo.config.useSSR` is true, the initial HTML is pre-rendered on the server. This includes:
1.  FontAwesome CSS links.
2.  Global theme CSS.

**Required Changes:**
In `src/main/addon/Stylesheet.mjs`, inside the `construct` method:
1.  Prevent loading FontAwesome if `Neo.config.useSSR` is true.
2.  Prevent calling `addGlobalCss()` if `Neo.config.useSSR` is true.

This prevents redundant network requests and double-loading of styles in SSR environments.

## Timeline

- 2025-11-20T21:02:43Z @tobiu added the `enhancement` label
- 2025-11-20T21:02:43Z @tobiu added the `ai` label
- 2025-11-20T21:05:33Z @tobiu assigned to @tobiu
- 2025-11-20T21:06:24Z @tobiu referenced in commit `92b8bd5` - "Optimize Stylesheet addon for SSR mode #7829"
- 2025-11-20T21:06:42Z @tobiu closed this issue

