---
id: 7713
title: 'health(github-workflow): reproduce gh-absent'
state: CLOSED
labels: []
assignees:
  - MannXo
createdAt: '2025-11-07T08:28:23Z'
updatedAt: '2025-11-08T10:05:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7713'
author: MannXo
commentsCount: 1
parentIssue: 7687
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-08T10:05:07Z'
---
# health(github-workflow): reproduce gh-absent

### Summary

Reproduce startup behavior when the GitHub CLI (`gh`) is entirely absent or not on the PATH; add unit tests for `HealthService`, implement an explicit ENOENT detection and a small non-blocking retry/backoff so the server recovers when `gh` becomes available, and add a short runbook/docs snippet with reproduction and remediation steps.
(see parent issue #7687)

### To do

- Add reproducible instructions and a short script to simulate `gh` being absent (e.g., PATH modification) under `ai/mcp/server/github-workflow/docs/gh-absent.md`.
- Add unit tests for `HealthService` that mock `child_process.exec` / `execAsync` to simulate these states:
  - `ENOENT` (gh not installed / not in PATH)
  - stdout empty + stderr-only output
  - gh present but unauthenticated
  - gh present but old version
- Implement code changes in `ai/mcp/server/github-workflow/services/HealthService.mjs` to:
  - Detect `ENOENT` explicitly and log a clear, actionable message ("gh CLI not found in PATH; tools will be disabled until installed")
  - Return a consistent health status (degraded/unhealthy) without crashing the server
  - Add a small non-blocking retry/backoff (configurable) for auth/version checks so the server can recover without restart
- Add a short runbook/docs entry with reproduction steps and remediation commands.

Acceptance criteria

- Reproduction steps and logs included in the issue or added doc file
- Unit tests added covering the four states; tests pass locally and in CI
- HealthService code updated with ENOENT handling and retry/backoff and no server crash on startup
- PR references this issue and parent #7687

## Timeline

- 2025-11-07T08:48:47Z @tobiu added parent issue #7687
- 2025-11-07T08:49:31Z @tobiu assigned to @MannXo
### @tobiu - 2025-11-07T08:52:21Z

@MannXo Thanks for the new tickets. I assigned both to you, assuming that you want to tackle them. We are getting super close to v11 => all tests got migrated to playwright, and I fixed the combobox issues and created a faster and non-vulnerable version of `jsdoc-x` within the repo.

On my end, I will create the `.npmignore` next, and then polish the AI guides more.

- 2025-11-07T09:35:38Z @MannXo cross-referenced by PR #7717
- 2025-11-08T10:05:07Z @tobiu closed this issue

