---
title: Enable Agent to List GitHub Issues and PRs
labels: enhancement, AI, hacktoberfest, good first issue, help wanted
---

GH ticket id: #<number>

**Epic:** Integrate GitHub CLI to Streamline Contribution Workflow
**Phase:** 1
**Assignee:** Mahita07
**Status:** To Do

## Description

As a foundational capability, the AI agent needs to be able to view open issues and pull requests. This allows the agent to gain context on ongoing work and is a prerequisite for more advanced interactions like reviewing PRs. This ticket involves creating a simple workflow for the agent to use the `gh` command to list this information.

## Acceptance Criteria

1.  Define a new workflow in `AGENTS.md` that instructs the agent on how to use `gh issue list` to see open issues.
2.  Define a new workflow in `AGENTS.md` that instructs the agent on how to use `gh pr list` to see open pull requests.
3.  The workflow should include guidance on what to do with this information (e.g., "To get an overview of current work, you can run `gh pr list`.").
4.  The agent should be instructed to use these commands when asked questions like "What are the current open PRs?" or "Are there any issues related to the dashboard?".
