---
id: 9859
title: Enforce Resolves keyword for automatic PR closure
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-04-10T10:13:29Z'
updatedAt: '2026-04-10T10:14:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9859'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-10T10:14:13Z'
---
# Enforce Resolves keyword for automatic PR closure

## Goal
Enforce the use of the `Resolves #[Issue Number]` keyword in Pull Requests to ensure automatic closure of linked tracking tickets upon merge.

## Context
During the previous dogfooding session (PR #9856), the PR omitted the exact closing keywords, leaving the associated ticket (#9855) open in a dangling state. GitHub relies on specific keywords to trigger the automation.

## Actions
- Update the `AGENTS.md` Ticket Closure Protocol to explicitly require `Resolves #[Issue Number]` when creating the PR.
- Update the `pr-review-template.md` to format the Context & Graph Linking section with `Resolves #[Issue Number]`.

## Timeline

- 2026-04-10T10:13:30Z @tobiu added the `documentation` label
- 2026-04-10T10:13:30Z @tobiu added the `ai` label
- 2026-04-10T10:13:40Z @tobiu assigned to @tobiu
- 2026-04-10T10:13:43Z @tobiu referenced in commit `83c79f7` - "docs: Enforce 'Resolves' keyword for automatic PR closure (#9859)"
- 2026-04-10T10:13:47Z @tobiu cross-referenced by PR #9860
- 2026-04-10T10:14:13Z @tobiu referenced in commit `6cd56b6` - "Merge pull request #9860 from neomjs/agent/9859-enforce-resolves-keyword

docs: Enforce 'Resolves' keyword for automatic PR closure (#9859)"
- 2026-04-10T10:14:13Z @tobiu closed this issue

