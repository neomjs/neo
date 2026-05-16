---
id: 9031
title: 'Feat: DevRank Cleanup Service'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2026-02-07T18:30:59Z'
updatedAt: '2026-02-07T18:34:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9031'
author: tobiu
commentsCount: 0
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-07T18:34:02Z'
---
# Feat: DevRank Cleanup Service

Implement a `Cleanup` service to enforce data integrity, sorting, and retroactive policy application.

**Features:**
- **Purge:** Remove users from `users.json` and `tracker.json` if they are blacklisted or fall below the `minTotalContributions` threshold (unless whitelisted).
- **Sort:** consistently sort all JSON resources (`users` by contributions, others by login/key) to minimize git diff noise.
- **CLI:** Add `devrank:cleanup` script.

## Timeline

- 2026-02-07T18:31:00Z @tobiu added the `enhancement` label
- 2026-02-07T18:31:08Z @tobiu added parent issue #8930
- 2026-02-07T18:31:37Z @tobiu assigned to @tobiu
- 2026-02-07T18:33:47Z @tobiu referenced in commit `7feec3c` - "feat: DevRank Cleanup Service (#9031)

- Implemented Cleanup service to enforce contribution thresholds and sorting.
- Pruned ~220 low-activity users from users.json.
- Sorted all JSON resources for consistency."
- 2026-02-07T18:34:02Z @tobiu closed this issue

