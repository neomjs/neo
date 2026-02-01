---
id: 8937
title: 'Feat: Discovery Engine - The Spider'
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-01T16:43:17Z'
updatedAt: '2026-02-01T16:44:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8937'
author: tobiu
commentsCount: 0
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: Discovery Engine - The Spider

This task focuses on implementing the "Spider" discovery mechanism to expand the contributor index beyond the top repositories.

### Requirements
1.  **Spider Logic:** Update `gh_discovery.mjs` to traverse the `following` graph of the initial "seed" candidates.
2.  **Depth Control:** Implement a depth limit (e.g., 1 or 2 layers) to prevent infinite crawling.
3.  **Filtration:** Apply a "Pulse Check" (e.g., >50 contributions in current year) before performing a "Deep Scan" on new candidates to optimize API usage.
4.  **Deduplication:** Ensure users are not scanned twice.

### Acceptance Criteria
- The script discovers and indexes high-contribution users who may not be in the top 50 repositories but are followed by top contributors.
- The `resources/data.json` file is populated with these new candidates.


## Timeline

- 2026-02-01T16:43:18Z @tobiu added the `enhancement` label
- 2026-02-01T16:43:18Z @tobiu added the `ai` label
- 2026-02-01T16:43:26Z @tobiu added parent issue #8930
- 2026-02-01T16:44:46Z @tobiu assigned to @tobiu

