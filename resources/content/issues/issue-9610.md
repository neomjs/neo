---
id: 9610
title: Add a 24-hour grace period to `prevent-reopen` workflow
state: CLOSED
labels:
  - enhancement
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-03-31T12:19:57Z'
updatedAt: '2026-03-31T12:22:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9610'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-31T12:22:56Z'
---
# Add a 24-hour grace period to `prevent-reopen` workflow

The `prevent-reopen.yml` GitHub action strictly closes reopened tickets to preserve SSG issue-archive integrity. However, this is too rigid and catches immediate, accidental closures of active tickets. We need to soften it by introducing a rolling 24-hour grace period based on the last `closed` timeline event to selectively allow same-day reopens while still achieving the primary goal.

## Timeline

- 2026-03-31T12:19:58Z @tobiu added the `enhancement` label
- 2026-03-31T12:19:58Z @tobiu added the `ai` label
- 2026-03-31T12:19:59Z @tobiu added the `build` label
- 2026-03-31T12:20:47Z @tobiu referenced in commit `a345743` - "feat: Add 24-hour grace period to prevent-reopen workflow (#9610)"
- 2026-03-31T12:21:01Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-31T12:21:03Z

Implementation complete and merged.

- 2026-03-31T12:21:04Z @tobiu closed this issue
- 2026-03-31T12:22:11Z @tobiu reopened this issue
### @tobiu - 2026-03-31T12:22:55Z

Test completed successfully.

- 2026-03-31T12:22:56Z @tobiu closed this issue

