---
id: 7613
title: Update Pull Request Template for Enforced Issue Linking
state: CLOSED
labels:
  - documentation
assignees:
  - tobiu
createdAt: '2025-10-22T22:08:08Z'
updatedAt: '2025-10-22T22:10:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7613'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-22T22:10:18Z'
---
# Update Pull Request Template for Enforced Issue Linking

Update the `.github/PULL_REQUEST_TEMPLATE.md` to enforce linking PRs to GitHub issues using the `Closes #` keyword, improving issue tracking and auto-closing behavior.

## Scope
The `.github/PULL_REQUEST_TEMPLATE.md` file has been modified to:
1.  Directly prompt for an issue number using `Closes #`.
2.  Provide a section for explaining why a PR might not close an issue.
3.  Include a warning about PRs without issue references.
4.  Ensure the new section is prominently placed at the top of the template.

## Goal
To improve the consistency and reliability of issue tracking within the project by ensuring all Pull Requests are explicitly linked to a corresponding GitHub issue, and to leverage GitHub's automatic issue closing feature.

## Timeline

- 2025-10-22T22:08:08Z @tobiu assigned to @tobiu
- 2025-10-22T22:08:10Z @tobiu added the `documentation` label
- 2025-10-22T22:08:53Z @tobiu referenced in commit `c0fdfad` - "Update Pull Request Template for Enforced Issue Linking #7613"
- 2025-10-22T22:10:18Z @tobiu closed this issue

