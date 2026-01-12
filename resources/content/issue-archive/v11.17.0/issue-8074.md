---
id: 8074
title: Enhance code.LivePreview to support nested windows
state: CLOSED
labels:
  - enhancement
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-09T21:54:25Z'
updatedAt: '2025-12-09T22:08:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8074'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-09T22:08:46Z'
---
# Enhance code.LivePreview to support nested windows

This ticket covers a significant refactoring of Neo.code.LivePreview and Neo.component.Markdown to support robust, recursive multi-window capabilities.

Key Changes:

1. Resolved Relative URLs: Implemented beforeSetWindowUrl in LivePreview to resolve ./ paths against the application root. This ensures child app URLs remain valid even when the component is popped out to a new window location.

2. Architectural Refactor of Markdown Renderer:
    - Removed legacy technical debt where Markdown.mjs modified its parent container's HTML. It now correctly manages its own html state.
    - Removed the explicit context object passing. Components now rely on their own instance state (appName, windowId) for correct context resolution.
    - Added windowUrl config to propagate the correct child app environment to nested LivePreview instances.

3. Recursive Window Support:
    - Implemented afterSetWindowId in Markdown.mjs to propagate window changes to all active child components (e.g., interactive examples nested within the markdown).
    - This allows for "recursive popping," where a LivePreview can be popped out, and a LivePreview inside that window can be popped out again, maintaining full functionality.

4. Component Lifecycle & Re-mounting:
    - Updated Container.Base to force mounted = false when moving a component to a different window. This ensures wrappers (like Monaco Editor) correctly re-initialize their main-thread counterparts in the new window context.
    - Hardened MonacoEditor main thread addon to gracefully handle instance lookups during window transitions.

These changes collectively ensure that complex, nested documentation views remain fully interactive and stable when moved between browser windows.

## Timeline

- 2025-12-09T21:54:25Z @tobiu assigned to @tobiu
- 2025-12-09T21:54:26Z @tobiu added the `enhancement` label
- 2025-12-09T21:54:27Z @tobiu added the `architecture` label
- 2025-12-09T21:55:19Z @tobiu referenced in commit `7ffe5ca` - "Enhance code.LivePreview to support nested windows #8074"
### @tobiu - 2025-12-09T22:08:46Z

<img width="1081" height="1375" alt="Image" src="https://github.com/user-attachments/assets/9f5a8634-468a-4d6d-b43a-08210a027842" />

- 2025-12-09T22:08:46Z @tobiu closed this issue

