---
title: Enable Agent to Diff a Pull Request
labels: enhancement, AI, hacktoberfest, good first issue, help wanted
---

GH ticket id: #7371

**Epic:** Integrate GitHub CLI to Streamline Contribution Workflow
**Phase:** 3
**Assignee:** pranjalarora98
**Status:** To Do

## Description

After checking out a PR branch, the agent needs a way to see the changes introduced by the pull request. The `gh pr diff` command is a straightforward way to get a summary of the changes. This ticket is to create a workflow for the agent to use this command.

## Acceptance Criteria

1.  A new workflow is added to `AGENTS.md`.
2.  The workflow instructs the agent on how to use `gh pr diff <PR_NUMBER>` to view the changes in a pull request.
3.  The agent should be instructed to use this command after checking out a PR branch to get an overview of the changes before doing a more detailed file-by-file review.
