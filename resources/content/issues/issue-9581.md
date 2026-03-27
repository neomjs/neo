---
id: 9581
title: 'Bug: Webpack fails to resolve Task, Canvas, and Data worker dynamic chunks due to strict magic comments'
state: CLOSED
labels:
  - bug
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-03-27T13:54:15Z'
updatedAt: '2026-03-27T14:18:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9581'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-27T14:18:02Z'
---
# Bug: Webpack fails to resolve Task, Canvas, and Data worker dynamic chunks due to strict magic comments

Following the fix in #9580, the `^` start-of-line anchor was identified in the `webpackInclude` regexes for `Task.mjs`, `Canvas.mjs`, and `Data.mjs` as well. 

This strict anchor prevented the Webpack context matcher from safely interpreting contextual string paths (e.g., `./apps/portal/canvas.mjs`), resulting in dynamic chunks being excluded from the build map. This led to fatal runtime errors such as `Renderer Remote Stub not found` inside production and development builds for components like the Portal app.

The `^` anchors have been surgically removed, restoring full compilation mapping across all active workers.

## Timeline

- 2026-03-27T13:54:17Z @tobiu added the `bug` label
- 2026-03-27T13:54:17Z @tobiu added the `ai` label
- 2026-03-27T13:54:17Z @tobiu added the `build` label
- 2026-03-27T14:18:02Z @tobiu closed this issue
- 2026-03-27T14:18:20Z @tobiu assigned to @tobiu

