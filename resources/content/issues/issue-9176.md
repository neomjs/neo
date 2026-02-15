---
id: 9176
title: 'DevIndex: Polish Top Repo Display and Column Order'
state: CLOSED
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-02-15T19:03:40Z'
updatedAt: '2026-02-15T19:14:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9176'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-15T19:14:16Z'
---
# DevIndex: Polish Top Repo Display and Column Order

Two refinements to the DevIndex grid:

1.  **Top Repo Display:**
    *   Currently, the column displays the `owner/repo` string.
    *   **Change:** Display the **contribution count** as the text label instead. The repo name is already accessible via the link's `href`.
    *   The link should still point to the repository.

2.  **Column Order:**
    *   Swap **Top Repo** and **Company**.
    *   **Reasoning:** Placing "Top Repo" immediately after "Activity" creates a logical grouping of "What they do" (Activity + Top Repo), followed by "Who they are" (Company, Location, etc.).

## Timeline

- 2026-02-15T19:03:41Z @tobiu added the `enhancement` label
- 2026-02-15T19:03:41Z @tobiu added the `ai` label
- 2026-02-15T19:13:59Z @tobiu referenced in commit `9b5fa64` - "fix(devindex): Polish Top Repo display, order, and code formatting (#9176)

- Top Repo: Display contribution count instead of name, reduce width to 100.
- Order: Move Top Repo after Activity.
- Code Style: Fix indentation and formatting in buildDynamicColumns."
- 2026-02-15T19:14:16Z @tobiu closed this issue

