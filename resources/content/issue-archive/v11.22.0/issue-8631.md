---
id: 8631
title: Scaffold Header Canvas Architecture
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-14T13:39:14Z'
updatedAt: '2026-01-14T14:11:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8631'
author: tobiu
commentsCount: 1
parentIssue: 8630
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T14:11:10Z'
---
# Scaffold Header Canvas Architecture

- Create `apps/portal/canvas/HeaderCanvas.mjs` (Shared Worker singleton).
- Create `apps/portal/view/HeaderCanvas.mjs` (App Worker component).
- Update `apps/portal/canvas/Helper.mjs` to register the new canvas via `importHeaderCanvas`.
- Establish the `remote` connection between the two.


## Timeline

- 2026-01-14T13:39:15Z @tobiu added the `enhancement` label
- 2026-01-14T13:39:15Z @tobiu added the `ai` label
- 2026-01-14T13:40:18Z @tobiu added parent issue #8630
- 2026-01-14T14:10:26Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-14T14:10:30Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully scaffolded the Header Canvas architecture.
> - Created `Portal.canvas.HeaderCanvas` (Shared Worker)
> - Created `Portal.view.HeaderCanvas` (App Worker)
> - Registered the new canvas in `Portal.canvas.Helper`
> - Integrated the canvas overlay into `Portal.view.HeaderToolbar` with absolute positioning.
> 
> Ready for visual effect implementation.

- 2026-01-14T14:10:52Z @tobiu referenced in commit `4c110c9` - "feat: Scaffold Header Canvas architecture (#8631)"
- 2026-01-14T14:11:10Z @tobiu closed this issue

