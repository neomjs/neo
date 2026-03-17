---
id: 9495
title: 'Grid Multi-Body: Implement Data-Driven Variable Row Height Architecture'
state: OPEN
labels:
  - epic
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-16T21:40:56Z'
updatedAt: '2026-03-17T18:59:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9495'
author: tobiu
commentsCount: 0
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Grid Multi-Body: Implement Data-Driven Variable Row Height Architecture

With a split-body architecture, ensuring visual row alignment is critical. We cannot rely on Main Thread DOM measurement loops to sync heights across bodies. 

**Requirements:**
1. **Record-Level Storage:** If variable row heights are enabled (e.g., due to text wrapping or expanding rows), the calculated height must be stored as state on the `data.Model` record (or a dedicated layout map).
2. **Worker-Driven Sync:** When a resize event occurs in any window, that window must report the new height to the App Worker. The App Worker then updates the state and pushes VDOM deltas to all active windows simultaneously, forcing uniform row heights across all SubGrids.

## Timeline

- 2026-03-16T21:40:58Z @tobiu added the `epic` label
- 2026-03-16T21:40:58Z @tobiu added the `ai` label
- 2026-03-16T21:40:58Z @tobiu added the `grid` label
- 2026-03-16T21:41:23Z @tobiu cross-referenced by #9486
- 2026-03-16T21:41:30Z @tobiu added parent issue #9486
- 2026-03-17T18:59:34Z @tobiu assigned to @tobiu

