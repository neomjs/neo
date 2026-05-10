---
id: 9493
title: 'Grid Multi-Body: Enable Cross-Window SubGrid Detachment (Pop-out)'
state: OPEN
labels:
  - epic
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-16T21:39:53Z'
updatedAt: '2026-03-17T18:59:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9493'
author: tobiu
commentsCount: 0
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Grid Multi-Body: Enable Cross-Window SubGrid Detachment (Pop-out)

As part of the Multi-Body Grid architecture, we need to ensure that the Left (`locked: 'start'`) and Right (`locked: 'end'`) SubGrids can be detached from the main window and rendered in separate popup windows, similar to the `LivePreview` component.

**Requirements:**
1. **Encapsulation:** SubGrids must be fully functional even when not physically adjacent in the same DOM tree.
2. **Window Connect/Disconnect Logic:** Implement logic (likely on the Grid Container) to handle moving a SubGrid instance into a newly spawned window and recovering it when the window closes.
3. **Data Continuity:** Ensure the App Worker maintains the single source of truth for the `Store` and `SelectionModel` regardless of which window the VDOM is projected into.

## Timeline

- 2026-03-16T21:39:54Z @tobiu added the `epic` label
- 2026-03-16T21:39:54Z @tobiu added the `ai` label
- 2026-03-16T21:39:54Z @tobiu added the `grid` label
- 2026-03-16T21:41:23Z @tobiu cross-referenced by #9486
- 2026-03-16T21:41:26Z @tobiu added parent issue #9486
- 2026-03-16T21:51:31Z @tobiu cross-referenced by #9496
- 2026-03-16T22:23:09Z @tobiu cross-referenced by #9498
- 2026-03-17T18:59:23Z @tobiu assigned to @tobiu

