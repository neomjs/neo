---
id: 8662
title: Scaffold Home Canvas Architecture
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-15T01:05:45Z'
updatedAt: '2026-01-15T01:13:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8662'
author: tobiu
commentsCount: 1
parentIssue: 8661
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T01:10:56Z'
---
# Scaffold Home Canvas Architecture

- Create `apps/portal/view/home/HomeCanvas.mjs` (View).
- Create `apps/portal/canvas/HomeCanvas.mjs` (SharedWorker).
- Integrate into `apps/portal/view/home/parts/MainNeo.mjs`.
- Verify SharedWorker connection and basic drawing.

## Timeline

- 2026-01-15T01:05:46Z @tobiu added the `enhancement` label
- 2026-01-15T01:05:46Z @tobiu added the `ai` label
- 2026-01-15T01:05:56Z @tobiu added parent issue #8661
- 2026-01-15T01:10:03Z @tobiu referenced in commit `71798c4` - "feat: Scaffold Home Canvas Architecture (#8662)"
### @tobiu - 2026-01-15T01:10:39Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully scaffolded the Home Canvas architecture.
> - Created `apps/portal/view/home/HomeCanvas.mjs` (App Worker View).
> - Created `apps/portal/canvas/HomeCanvas.mjs` (Shared Worker Renderer).
> - Updated `apps/portal/canvas/Helper.mjs` to expose the import method.
> - Integrated the canvas into `MainNeo.mjs` as a background layer.
> 
> The canvas is now ready for physics and rendering logic.

- 2026-01-15T01:10:56Z @tobiu closed this issue
- 2026-01-15T01:13:09Z @tobiu assigned to @tobiu

