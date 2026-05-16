---
id: 8157
title: Create Neo.dashboard.Panel
state: CLOSED
labels:
  - enhancement
  - ai
  - feature
assignees:
  - tobiu
createdAt: '2025-12-26T16:03:11Z'
updatedAt: '2025-12-26T17:23:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8157'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-26T17:23:13Z'
---
# Create Neo.dashboard.Panel

**Objective**
Create a specialized `Neo.dashboard.Panel` class to serve as the standard child component for `Neo.dashboard.Container`. This class will encapsulate dashboard-specific configurations and behavior, enabling per-item customization for features like the "detach-to-window" functionality.

**Key Features**

1.  **Extends:** `Neo.container.Panel`
2.  **New Configs:**
    *   `popupUrl` (String|Function): Defines the URL of the app shell to use when this specific panel is detached into a popup window. This overrides the dashboard container's default `popupUrl`.
    *   `popupConfig` (Object): Defines window features (width, height, etc.) specific to this panel when detached.

**Rationale**
While generic panels can be used in dashboards, a dedicated class provides a clean contract for dashboard-specific features and allows for future enhancements (e.g., `isClosable`, `isMaximizable`, `defaultPosition`) without polluting the generic `container.Panel` namespace.

**Related Issues**
*   Relates to #8155 (Refactoring dashboard.Container logic)


## Timeline

- 2025-12-26T16:03:12Z @tobiu added the `enhancement` label
- 2025-12-26T16:03:13Z @tobiu added the `ai` label
- 2025-12-26T16:03:13Z @tobiu added the `feature` label
- 2025-12-26T16:27:18Z @tobiu assigned to @tobiu
- 2025-12-26T16:27:43Z @tobiu referenced in commit `d13d230` - "Create Neo.dashboard.Panel #8157"
- 2025-12-26T17:23:01Z @tobiu referenced in commit `03d7487` - "#8157 dashboard.Panel: documentation"
- 2025-12-26T17:23:13Z @tobiu closed this issue
- 2025-12-26T17:29:03Z @tobiu cross-referenced by #8156

