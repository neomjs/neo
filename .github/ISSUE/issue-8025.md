---
id: 8025
title: 'Create Custom Theme: Neo Cyberpunk'
state: OPEN
labels:
  - epic
  - design
  - ai
assignees: []
createdAt: '2025-12-04T23:37:19Z'
updatedAt: '2025-12-04T23:37:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8025'
author: tobiu
commentsCount: 0
parentIssue: 7918
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Create Custom Theme: Neo Cyberpunk

Create a new custom theme `neo-theme-cyberpunk` (folder: `resources/scss/theme-cyberpunk`) to support the Cyberpunk aesthetic of the AgentOS application and future apps.

**Scope:**
- Create the theme structure (`resources/scss/theme-cyberpunk`).
- Implement global styles (neon colors, dark backgrounds, high contrast, glow effects).
- Implement component-specific overrides for:
  - `Neo.grid.Container` (Wireframe borders, neon selection)
  - `Neo.container.Panel`
  - `Neo.container.Toolbar`
  - `Neo.button.Base`
- Ensure proper variable nullification to support nesting within other themes.

**Design Language:**
- **Colors:** Neon cyan (`#00d2ff`), gold (`#f1c40f`), red (`#ff4757`), dark backgrounds (`#0d1117`).
- **Typography:** Monospace fonts (`Courier New`, `Consolas`) for data/logs.
- **Effects:** Text shadows, box shadows (glows), sharp borders (no rounding).

## Activity Log

- 2025-12-04 @tobiu added the `epic` label
- 2025-12-04 @tobiu added the `design` label
- 2025-12-04 @tobiu added the `ai` label
- 2025-12-04 @tobiu added parent issue #7918

