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
closedAt: '2025-10-13T21:14:11Z'
---
# Enable Agent to List GitHub Issues and PRs

**Reported by:** @tobiu on 2025-10-05

---

**Parent Issue:** #7364 - Integrate GitHub CLI to Streamline Contribution Workflow

---

As a foundational capability, the AI agent needs to be able to view open issues and pull requests. This allows the agent to gain context on ongoing work and is a prerequisite for more advanced interactions like reviewing PRs. This ticket involves creating a simple workflow for the agent to use the `gh` command to list this information.

## Acceptance Criteria

1.  Define a new workflow in `AGENTS.md` that instructs the agent on how to use `gh issue list` to see open issues.
2.  Define a new workflow in `AGENTS.md` that instructs the agent on how to use `gh pr list` to see open pull requests.
3.  The workflow should include guidance on what to do with this information (e.g., "To get an overview of current work, you can run `gh pr list`.").
4.  The agent should be instructed to use these commands when asked questions like "What are the current open PRs?" or "Are there any issues related to the dashboard?".

## Comments

### @Mahita07 - 2025-10-05 10:39

Hey @tobiu could you please assign me this issue ? I would love to work on it. 

### @tobiu - 2025-10-05 10:49

sure. please see the comment inside your other sub first.

### @Mahita07 - 2025-10-05 11:13

Sure, thank you !

### @tobiu - 2025-10-13 21:14

closing the ticket as resolved.

