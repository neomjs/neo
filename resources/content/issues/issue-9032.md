---
id: 9032
title: 'Feat: DevRank Spider Random Walk Strategy'
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-07T18:44:14Z'
updatedAt: '2026-02-07T18:44:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9032'
author: tobiu
commentsCount: 0
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: DevRank Spider Random Walk Strategy

Enhance the Spider's discovery algorithm to avoid "Filter Bubbles" (repeatedly scanning top repos) and increase coverage.

**Strategies to Explore:**
1.  **Temporal Slicing:** Search repositories by random creation date ranges (e.g., `created:2022-05-01..2022-05-07`) instead of just `stars:>1000`.
2.  **Stargazer Leap:** Pick a random indexed user -> fetch their starred repos -> scan those repos.
3.  **Dictionary Attack:** Search for random keywords/prefixes.

**Goal:** Ensure diverse discovery of "hidden gem" developers.

## Timeline

- 2026-02-07T18:44:15Z @tobiu added the `enhancement` label
- 2026-02-07T18:44:15Z @tobiu added the `ai` label
- 2026-02-07T18:44:23Z @tobiu added parent issue #8930
- 2026-02-07T18:44:46Z @tobiu assigned to @tobiu
- 2026-02-07T18:45:13Z @tobiu referenced in commit `40236b2` - "chore: Exclude DevRank Data from NPM Package (#9032)

- Added 'apps/devrank/resources/*.json' to .npmignore to prevent package bloat."

