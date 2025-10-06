---
title: Enable Agent to Comment on Pull Requests
labels: enhancement, AI, hacktoberfest, good first issue, help wanted
---

GH ticket id: #7372

**Epic:** Integrate GitHub CLI to Streamline Contribution Workflow
**Phase:** 3
**Status:** To Do

## Description

After reviewing a pull request, the agent needs to be able to provide feedback directly on GitHub. The `gh pr review` and `gh issue comment` commands can be used for this purpose. This ticket is to create the workflow for the agent to use these commands to comment on a PR.

## Acceptance Criteria

1.  A new workflow is added to `AGENTS.md`.
2.  The workflow instructs the agent on how to use `gh pr review <PR_NUMBER> --comment "..."` to add a review comment to a pull request.
3.  The workflow should also mention `gh issue comment <PR_URL> --body "..."` as an alternative for general comments.
4.  The agent should be instructed to use these commands to provide feedback after reviewing the code.
