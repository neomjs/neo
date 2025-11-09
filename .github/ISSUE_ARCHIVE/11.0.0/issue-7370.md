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
closedAt: '2025-10-06T13:21:52Z'
---
# Enable Agent to Checkout PR Branches

**Reported by:** @tobiu on 2025-10-05

---

**Parent Issue:** #7364 - Integrate GitHub CLI to Streamline Contribution Workflow

---

To allow the agent to review code from external pull requests, it needs a way to fetch and check out the code locally. The GitHub CLI provides a simple command for this: `gh pr checkout`. This ticket is to create the workflow for the agent to use this command.

## Acceptance Criteria

1.  A new workflow is added to `AGENTS.md`.
2.  The workflow instructs the agent on how to use `gh pr checkout <PR_NUMBER>` to fetch the code for a specific pull request.
3.  The workflow should include safety checks, such as reminding the agent to ensure its current work is committed or stashed before checking out a new branch.
4.  The agent should be instructed to use this command as the first step when asked to "review PR #123".

## Comments

### @SarthakJain29 - 2025-10-05 17:19

Hi again! would love to work on this.

### @tobiu - 2025-10-05 17:53

assigned. ai native workflow strongly recommended for this one.

