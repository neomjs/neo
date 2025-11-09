---
id: 7714
title: 'ci(testing): gate GitHub-integration tests and add diagnostics polish'
state: OPEN
labels: []
assignees:
  - MannXo
createdAt: '2025-11-07T08:30:24Z'
updatedAt: '2025-11-07T08:49:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7714'
author: MannXo
commentsCount: 0
parentIssue: 7687
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
---
# ci(testing): gate GitHub-integration tests and add diagnostics polish

**Reported by:** @MannXo on 2025-11-07

---

**Parent Issue:** #7687 - Enhance GitHub Workflow server robustness when gh cli is not installed

---

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

