---
id: 7759
title: Move "blocked by" and "blocking" relationship information to frontmatter in `IssueSyncer.mjs`
state: CLOSED
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-11-12T14:18:48Z'
updatedAt: '2025-11-13T10:32:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7759'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-13T10:32:35Z'
---
# Move "blocked by" and "blocking" relationship information to frontmatter in `IssueSyncer.mjs`

The `IssueSyncer.mjs` currently adds "blocked by" and "blocking" relationship information directly into the markdown body of the issue. To ensure consistency and better structured data, this information should be moved into the frontmatter of the markdown file. This aligns with how other structured metadata is handled and improves machine readability.

## Timeline

- 2025-11-12T14:18:50Z @tobiu added the `enhancement` label
- 2025-11-12T14:18:50Z @tobiu added the `ai` label
- 2025-11-12T14:22:13Z @tobiu cross-referenced by PR #7753
- 2025-11-13T06:29:07Z @MannXo cross-referenced by PR #7764
- 2025-11-13T10:32:35Z @tobiu closed this issue

