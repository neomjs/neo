---
title: Enable Agent to Checkout PR Branches
labels: enhancement, AI, hacktoberfest, good first issue, help wanted
---

GH ticket id: #7370

**Epic:** Integrate GitHub CLI to Streamline Contribution Workflow
**Phase:** 3
**Status:** To Do

## Description

To allow the agent to review code from external pull requests, it needs a way to fetch and check out the code locally. The GitHub CLI provides a simple command for this: `gh pr checkout`. This ticket is to create the workflow for the agent to use this command.

## Acceptance Criteria

1.  A new workflow is added to `AGENTS.md`.
2.  The workflow instructs the agent on how to use `gh pr checkout <PR_NUMBER>` to fetch the code for a specific pull request.
3.  The workflow should include safety checks, such as reminding the agent to ensure its current work is committed or stashed before checking out a new branch.
4.  The agent should be instructed to use this command as the first step when asked to "review PR #123".
