---
id: 9177
title: 'DevIndex: Add ''Commits %'' Column and Automation Filter'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-15T20:40:16Z'
updatedAt: '2026-02-15T21:07:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9177'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-15T21:07:39Z'
---
# DevIndex: Add 'Commits %' Column and Automation Filter

1.  **Model**: Add `commitRatio` calculated field to `DevIndex.model.Contributor`.
    -   Logic: `(Total Commits / Total Contributions) * 100`.
    -   Optimization: Reuse `totalCommits` if available (Record context), fallback to array reduction (Raw context).
2.  **Grid**: Add "Commits %" column after "Total".
    -   Format: 2 decimal places (e.g., "45.50%").
3.  **Controls**: Add filter for "High Automation" users based on this ratio.

## Timeline

- 2026-02-15T20:40:16Z @tobiu added the `enhancement` label
- 2026-02-15T20:40:17Z @tobiu added the `ai` label
- 2026-02-15T21:06:37Z @tobiu referenced in commit `97f958b` - "feat(devindex): Add Commit Ratio column and automation filter (#9177)"
### @tobiu - 2026-02-15T21:06:57Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the requested changes:
> 
> 1.  **Model**: Added `commitRatio` calculated field to `DevIndex.model.Contributor`, with an optimized implementation that reuses `totalCommits` if available (Record context) or calculates it on the fly (Turbo/POJO context).
> 2.  **Store**: Added `commitRatio` filter to `DevIndex.store.Contributors`.
> 3.  **Grid**: Added "Commits %" column after "Total", formatted to 2 decimal places without the '%' symbol for cleaner UI.
> 4.  **Controls**: Added "Hide Commit Ratio > 90%" checkbox, which triggers the new filter logic in the controller.
> 
> The changes are committed and pushed to `dev`.

- 2026-02-15T21:07:11Z @tobiu assigned to @tobiu
- 2026-02-15T21:07:26Z @tobiu added parent issue #9106
- 2026-02-15T21:07:39Z @tobiu closed this issue

