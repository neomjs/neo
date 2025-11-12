---
id: 7759
title: >-
  Move "blocked by" and "blocking" relationship information to frontmatter in
  `IssueSyncer.mjs`
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-11-12T14:18:48Z'
updatedAt: '2025-11-12T14:18:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7759'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
---
# Move "blocked by" and "blocking" relationship information to frontmatter in `IssueSyncer.mjs`

**Reported by:** @tobiu on 2025-11-12

The `IssueSyncer.mjs` currently adds "blocked by" and "blocking" relationship information directly into the markdown body of the issue. To ensure consistency and better structured data, this information should be moved into the frontmatter of the markdown file. This aligns with how other structured metadata is handled and improves machine readability.

