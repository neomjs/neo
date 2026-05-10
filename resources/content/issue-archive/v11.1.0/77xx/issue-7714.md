---
id: 7714
title: 'ci(testing): gate GitHub-integration tests and add diagnostics polish'
state: CLOSED
labels: []
assignees:
  - MannXo
createdAt: '2025-11-07T08:30:24Z'
updatedAt: '2025-11-10T20:17:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7714'
author: MannXo
commentsCount: 0
parentIssue: 7687
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-10T20:17:37Z'
---
# ci(testing): gate GitHub-integration tests and add diagnostics polish

## Summary

Add CI gating for GitHub-integration tests (tests that require GH auth or network access) and small diagnostics/observability polish for the HealthService logs.
(see parent issue #7687)

## Motivation

Integration tests that require `gh` or a `GITHUB_TOKEN` should be explicitly gated in CI to avoid flakiness. Separate this operational/CI-level work from the core HealthService bugfix to keep reviews focused.

## To do

- Add CI/test harness support to skip GitHub-integration tests unless a flag like `RUN_GH_INTEGRATION=true` is set in the environment.
- Update test code to respect the gate (skip or mark tests as skipped when token/gh missing).
- Optionally add a short structured diagnostic log line (e.g., `[DIAG] gh-status: missing`) so monitoring or CI can detect the condition.

Acceptance criteria

- CI or test harness skips GH integration tests by default and runs them only when `RUN_GH_INTEGRATION=true` and `GITHUB_TOKEN` (or gh auth) is present
- Tests cleanly report skipped when gate isn't enabled
- PR references this issue and parent #7687

## Timeline

- 2025-11-07T08:38:20Z @tobiu added parent issue #7687
- 2025-11-07T08:49:15Z @tobiu assigned to @MannXo
- 2025-11-08T17:36:42Z @MannXo cross-referenced by PR #7728
- 2025-11-10T20:17:37Z @tobiu closed this issue

