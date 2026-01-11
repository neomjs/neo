---
id: 8025
title: 'Create Custom Theme: Neo Cyberpunk'
state: OPEN
labels:
  - epic
  - design
  - ai
assignees:
  - tobiu
createdAt: '2025-12-04T23:37:19Z'
updatedAt: '2025-12-04T23:50:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8025'
author: tobiu
commentsCount: 0
parentIssue: 7918
subIssues:
  - '[x] 8026 Scaffold Neo Cyberpunk Theme Structure'
  - '[x] 8027 Implement Panel Styles for Neo Cyberpunk'
  - '[x] 8028 Implement Grid Styles for Neo Cyberpunk'
  - '[x] 8029 Implement Button Styles for Neo Cyberpunk'
  - '[x] 8030 Implement Toolbar Styles for Neo Cyberpunk'
subIssuesCompleted: 5
subIssuesTotal: 5
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

## Timeline

- 2025-12-04T23:37:20Z @tobiu added the `epic` label
- 2025-12-04T23:37:20Z @tobiu added the `design` label
- 2025-12-04T23:37:20Z @tobiu added the `ai` label
- 2025-12-04T23:37:38Z @tobiu added parent issue #7918
- 2025-12-04T23:41:17Z @tobiu added sub-issue #8026
- 2025-12-04T23:41:19Z @tobiu added sub-issue #8027
- 2025-12-04T23:41:21Z @tobiu added sub-issue #8028
- 2025-12-04T23:41:23Z @tobiu added sub-issue #8029
- 2025-12-04T23:41:25Z @tobiu added sub-issue #8030
- 2025-12-04T23:50:59Z @tobiu assigned to @tobiu
- 2025-12-05T00:42:49Z @tobiu referenced in commit `2a2b6d4` - "#8025 agentos app: use the cyberpunk theme"
- 2025-12-05T00:46:01Z @tobiu referenced in commit `a627f02` - "#8025 AgentOS.view.InterventionPanel: remove the grid margin"

