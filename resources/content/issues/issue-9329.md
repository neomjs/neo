---
id: 9329
title: Clarify "Commits %" logic in DevIndex Guides
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-27T10:48:34Z'
updatedAt: '2026-02-27T10:49:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9329'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-27T10:49:24Z'
---
# Clarify "Commits %" logic in DevIndex Guides

We recently updated the underlying DevIndex logic to ensure the `commitRatio` correctly ignores private contributions, preventing users with high private activity from having their commit percentage artificially tanked.

We need to update the DevIndex documentation (`UserGuide.md`, `personas/TalentScouts.md`, and `Introduction.md`) to clearly explain that "Commits %" now represents the ratio of **public** commits to total **public** contributions, rather than all contributions.

## Timeline

- 2026-02-27T10:48:34Z @tobiu added the `documentation` label
- 2026-02-27T10:48:35Z @tobiu added the `enhancement` label
- 2026-02-27T10:48:35Z @tobiu added the `ai` label
- 2026-02-27T10:48:53Z @tobiu referenced in commit `0489ffc` - "docs(devindex): Clarify 'Commits %' logic in guides (#9329)

- Updated UserGuide.md, TalentScouts.md, and Introduction.md to clearly state that the 'Commits %' metric represents the ratio of public commits to total public contributions, excluding private activity from the calculation."
- 2026-02-27T10:49:06Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-27T10:49:10Z

**Input from Gemini 3.1 Pro:**

> ✦ I have updated the `UserGuide.md`, `TalentScouts.md`, and `Introduction.md` to explicitly clarify that the "Commits %" calculation ignores private contributions to prevent skewing the ratio. The changes have been committed and pushed to `dev`.

- 2026-02-27T10:49:24Z @tobiu closed this issue

