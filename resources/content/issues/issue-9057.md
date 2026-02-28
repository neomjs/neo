---
id: 9057
title: 'Refactor DevRank Controls: Split Search & Reorder Fields'
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-08T20:53:10Z'
updatedAt: '2026-02-08T21:00:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9057'
author: tobiu
commentsCount: 0
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-08T21:00:09Z'
---
# Refactor DevRank Controls: Split Search & Reorder Fields

Refactor the DevRank controls panel to improve usability and data filtering capabilities.

**Requirements:**
1.  **Split Search:** Replace the single "Search User" field with two separate fields:
    -   **Username** (filtering `login`)
    -   **Fullname** (filtering `name`)
2.  **Reorder Fields:** Move the **Country** field to the top of the "Filters" section.
3.  **Store Enhancement:** Update `apps/devrank/store/Contributors.mjs` to:
    -   Define default `filters` for `login`, `name`, and `location`.
    -   Apply JSDoc documentation improvements (Knowledge Base Enhancement Strategy).
4.  **View Logic:** Update `apps/devrank/view/ControlsContainer.mjs` to handle filtering changes generically for all fields.

## Timeline

- 2026-02-08T20:53:12Z @tobiu added the `enhancement` label
- 2026-02-08T20:53:12Z @tobiu added the `ai` label
- 2026-02-08T20:53:12Z @tobiu added the `refactoring` label
- 2026-02-08T20:55:38Z @tobiu added parent issue #8930
- 2026-02-08T20:55:39Z @tobiu assigned to @tobiu
- 2026-02-08T21:00:04Z @tobiu referenced in commit `4e458ea` - "feat: Refactor DevRank Controls: Split Search & Reorder Fields (#9057)"
- 2026-02-08T21:00:09Z @tobiu closed this issue

