---
id: 7372
title: Enable Agent to Comment on Pull Requests
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - LemonDrop847
createdAt: '2025-10-05T11:24:46Z'
updatedAt: '2025-10-13T21:16:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7372'
author: tobiu
commentsCount: 3
parentIssue: 7364
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-13T21:16:05Z'
---
# Enable Agent to Comment on Pull Requests

After reviewing a pull request, the agent needs to be able to provide feedback directly on GitHub. The `gh pr review` and `gh issue comment` commands can be used for this purpose. This ticket is to create the workflow for the agent to use these commands to comment on a PR.

## Acceptance Criteria

1.  A new workflow is added to `AGENTS.md`.
2.  The workflow instructs the agent on how to use `gh pr review <PR_NUMBER> --comment "..."` to add a review comment to a pull request.
3.  The workflow should also mention `gh issue comment <PR_URL> --body "..."` as an alternative for general comments.
4.  The agent should be instructed to use these commands to provide feedback after reviewing the code.

## Timeline

- 2025-10-05T11:24:47Z @tobiu added the `enhancement` label
- 2025-10-05T11:24:47Z @tobiu added the `help wanted` label
- 2025-10-05T11:24:47Z @tobiu added the `good first issue` label
- 2025-10-05T11:24:47Z @tobiu added the `hacktoberfest` label
- 2025-10-05T11:24:47Z @tobiu added the `ai` label
- 2025-10-05T11:24:47Z @tobiu added parent issue #7364
### @LemonDrop847 - 2025-10-05T11:42:38Z

Hello, Can I try adding this workflow?

- 2025-10-05T11:45:50Z @tobiu assigned to @LemonDrop847
### @tobiu - 2025-10-05T11:46:07Z

assigned. please read my comment on your other ticket first.

- 2025-10-05T18:20:10Z @LemonDrop847 cross-referenced by PR #7383
### @tobiu - 2025-10-13T21:16:05Z

closing the ticket as resolved.

- 2025-10-13T21:16:05Z @tobiu closed this issue

