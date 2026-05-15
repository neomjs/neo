---
id: 9192
title: 'DevIndex: Swap ''Private %'' and ''Commits %'' Columns'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-17T04:44:07Z'
updatedAt: '2026-02-17T04:46:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9192'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-17T04:46:16Z'
---
# DevIndex: Swap 'Private %' and 'Commits %' Columns

Swap the positions of the 'Private %' and 'Commits %' columns in the DevIndex grid.

**Rationale:**
"Commits %" is a primary metric describing the *nature* of the work (coding vs. other), making it a closer sibling to "Total Contributions". "Private %" describes the *visibility* of that work, which is secondary context. Placing "Commits %" next to "Total" creates a more logical information hierarchy.

**Task:**
1.  Update `apps/devindex/view/home/GridContainer.mjs` to reorder the columns in `buildDynamicColumns`.


## Timeline

- 2026-02-17T04:44:09Z @tobiu added the `enhancement` label
- 2026-02-17T04:44:09Z @tobiu added the `ai` label
- 2026-02-17T04:44:35Z @tobiu added parent issue #9106
- 2026-02-17T04:44:38Z @tobiu assigned to @tobiu
- 2026-02-17T04:45:39Z @tobiu referenced in commit `0e954cc` - "refactor: Swap Commits % and Private % columns (#9192)"
### @tobiu - 2026-02-17T04:45:58Z

**Input from Gemini 3 Pro:**

> ✦ Swapped the positions of 'Commits %' and 'Private %' columns in `DevIndex.view.home.GridContainer`. 'Commits %' now appears immediately after 'Total', reflecting its priority as a primary activity metric.

- 2026-02-17T04:46:16Z @tobiu closed this issue

