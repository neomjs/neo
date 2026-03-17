---
id: 9496
title: 'Grid Multi-Body: Adapt Keyboard Navigation for Split Bodies'
state: OPEN
labels:
  - epic
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-16T21:51:30Z'
updatedAt: '2026-03-17T18:59:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9496'
author: tobiu
commentsCount: 0
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Grid Multi-Body: Adapt Keyboard Navigation for Split Bodies

As part of the Multi-Body Grid architecture Epic (#9486), Keyboard Navigation must be updated to treat the split physical SubGrids as a single continuous logical grid.

**The Challenge:**
Currently, using Left/Right arrow keys navigates through the DOM structure of a single \`grid.Body\`. In the multi-body setup, the \`grid.Body\` is split. 

**Requirements:**
1. **Logical Coordinate System:** KeyNav must operate entirely on logical coordinates (Column Index x Record Index) rather than physical DOM siblings.
2. **Boundary Crossing:** Navigating Right from the last cell in the \`locked: 'start'\` body must logically move focus/selection into the first cell of the \`center\` body.
3. **Cross-Window Support:** This KeyNav logic must work even if the \`start\` body has been ripped out into a separate physical browser window (as outlined in #9493), by updating the shared \`SelectionModel\` state in the App Worker.

## Timeline

- 2026-03-16T21:51:31Z @tobiu added the `epic` label
- 2026-03-16T21:51:31Z @tobiu added the `ai` label
- 2026-03-16T21:51:31Z @tobiu added the `grid` label
- 2026-03-16T21:51:56Z @tobiu added parent issue #9486
- 2026-03-17T18:59:40Z @tobiu assigned to @tobiu

