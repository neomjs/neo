---
id: 7370
title: Enable Agent to Checkout PR Branches
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - SarthakJain29
createdAt: '2025-10-05T11:15:32Z'
updatedAt: '2025-10-06T13:21:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7370'
author: tobiu
commentsCount: 2
parentIssue: 7364
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-06T13:21:52Z'
---
# Enable Agent to Checkout PR Branches

To allow the agent to review code from external pull requests, it needs a way to fetch and check out the code locally. The GitHub CLI provides a simple command for this: `gh pr checkout`. This ticket is to create the workflow for the agent to use this command.

## Acceptance Criteria

1.  A new workflow is added to `AGENTS.md`.
2.  The workflow instructs the agent on how to use `gh pr checkout <PR_NUMBER>` to fetch the code for a specific pull request.
3.  The workflow should include safety checks, such as reminding the agent to ensure its current work is committed or stashed before checking out a new branch.
4.  The agent should be instructed to use this command as the first step when asked to "review PR #123".

## Timeline

- 2025-10-05T11:15:34Z @tobiu added the `enhancement` label
- 2025-10-05T11:15:34Z @tobiu added the `help wanted` label
- 2025-10-05T11:15:34Z @tobiu added the `good first issue` label
- 2025-10-05T11:15:34Z @tobiu added the `hacktoberfest` label
- 2025-10-05T11:15:34Z @tobiu added the `ai` label
- 2025-10-05T11:15:34Z @tobiu added parent issue #7364
- 2025-10-05T14:13:01Z @tobiu cross-referenced by #7371
### @SarthakJain29 - 2025-10-05T17:19:52Z

Hi again! would love to work on this.

- 2025-10-05T17:52:37Z @tobiu assigned to @SarthakJain29
### @tobiu - 2025-10-05T17:53:23Z

assigned. ai native workflow strongly recommended for this one.

- 2025-10-06T11:29:05Z @SarthakJain29 cross-referenced by PR #7392
- 2025-10-06T12:18:17Z @SarthakJain29 cross-referenced by #7393
- 2025-10-06T13:21:52Z @tobiu closed this issue

