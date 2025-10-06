---
title: Define a Clear Pull Request Review Protocol for the Agent
labels: documentation, enhancement, AI, hacktoberfest, good first issue, help wanted
---

GH ticket id: #7373

**Epic:** Integrate GitHub CLI to Streamline Contribution Workflow
**Phase:** 3
**Status:** To Do

## Description

With the agent being able to check out, diff, and comment on pull requests, it is crucial to have a clear, documented protocol for how it should conduct code reviews. This ensures the agent's feedback is consistent, constructive, and aligned with the project's standards. This ticket is to create that protocol within `AGENTS.md`.

## Acceptance Criteria

1.  A new "Pull Request Review Protocol" section is added to `AGENTS.md`.
2.  The protocol must instruct the agent to always be constructive and polite in its feedback.
3.  The protocol must require the agent to verify the PR against the project's `.github/CODING_GUIDELINES.md`.
4.  The protocol must require the agent to run the project's tests (e.g., `npm test`) against the PR's code to check for regressions.
5.  The protocol should define a standard format for review comments, e.g., starting with a summary of findings, followed by specific line-by-line comments.
