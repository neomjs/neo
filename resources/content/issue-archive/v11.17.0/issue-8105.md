---
id: 8105
title: Adjust AgentOS logo to match Cyberpunk theme
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2025-12-13T15:08:48Z'
updatedAt: '2025-12-13T15:16:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8105'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-13T15:16:46Z'
---
# Adjust AgentOS logo to match Cyberpunk theme

The current Neo.mjs logo in AgentOS uses the default white color, which clashes with the app's Cyberpunk theme.

This task involves:
1.  Creating a new SVG variant (`neo_logo_cyberpunk.svg`) using the theme's primary accent color (`--cyber-cyan` / `#00d2ff`).
2.  Updating `apps/agentos/view/Viewport.mjs` to use this new asset.
3.  Updating `resources/scss/theme-cyberpunk/apps/agentos/Viewport.scss` to add a neon glow effect to the logo.

## Timeline

- 2025-12-13T15:08:49Z @tobiu added the `enhancement` label
- 2025-12-13T15:08:50Z @tobiu added the `design` label
- 2025-12-13T15:08:50Z @tobiu added the `ai` label
- 2025-12-13T15:08:59Z @tobiu assigned to @tobiu
- 2025-12-13T15:14:46Z @tobiu referenced in commit `08f55b8` - "Adjust AgentOS logo to match Cyberpunk theme #8105"
- 2025-12-13T15:16:47Z @tobiu closed this issue

