---
id: 7366
title: Enable Agent to List GitHub Issues and PRs
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - Mahita07
createdAt: '2025-10-05T10:37:15Z'
updatedAt: '2025-10-13T21:14:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7366'
author: tobiu
commentsCount: 4
parentIssue: 7364
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-13T21:14:11Z'
---
# Enable Agent to List GitHub Issues and PRs

As a foundational capability, the AI agent needs to be able to view open issues and pull requests. This allows the agent to gain context on ongoing work and is a prerequisite for more advanced interactions like reviewing PRs. This ticket involves creating a simple workflow for the agent to use the `gh` command to list this information.

## Acceptance Criteria

1.  Define a new workflow in `AGENTS.md` that instructs the agent on how to use `gh issue list` to see open issues.
2.  Define a new workflow in `AGENTS.md` that instructs the agent on how to use `gh pr list` to see open pull requests.
3.  The workflow should include guidance on what to do with this information (e.g., "To get an overview of current work, you can run `gh pr list`.").
4.  The agent should be instructed to use these commands when asked questions like "What are the current open PRs?" or "Are there any issues related to the dashboard?".

## Timeline

- 2025-10-05T10:37:15Z @tobiu added the `enhancement` label
- 2025-10-05T10:37:16Z @tobiu added parent issue #7364
- 2025-10-05T10:37:16Z @tobiu added the `help wanted` label
- 2025-10-05T10:37:16Z @tobiu added the `good first issue` label
- 2025-10-05T10:37:16Z @tobiu added the `hacktoberfest` label
- 2025-10-05T10:37:16Z @tobiu added the `ai` label
### @Mahita07 - 2025-10-05T10:39:37Z

Hey @tobiu could you please assign me this issue ? I would love to work on it. 

### @tobiu - 2025-10-05T10:49:42Z

sure. please see the comment inside your other sub first.

- 2025-10-05T10:49:47Z @tobiu assigned to @Mahita07
### @Mahita07 - 2025-10-05T11:13:27Z

Sure, thank you !

- 2025-10-06T17:39:05Z @Mahita07 cross-referenced by PR #7396
### @tobiu - 2025-10-13T21:14:11Z

closing the ticket as resolved.

- 2025-10-13T21:14:12Z @tobiu closed this issue

