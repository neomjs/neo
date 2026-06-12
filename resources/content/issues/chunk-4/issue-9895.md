---
id: 9895
title: 'bug: PullRequestService execAsync calls missing cwd — gh pr diff/checkout fail in headless environments'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-04-11T20:09:34Z'
updatedAt: '2026-04-11T20:19:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9895'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-11T20:19:26Z'
---
# bug: PullRequestService execAsync calls missing cwd — gh pr diff/checkout fail in headless environments

## Context

`PullRequestService.mjs` has two `execAsync` calls (lines 44, 89) that invoke `gh pr checkout` and `gh pr diff` without passing `{cwd: aiConfig.projectRoot}`. When the MCP server process is spawned from a directory outside the git repo (e.g., CWD = `/` via stdio transport), both commands fail with exit code 1 because `gh` cannot resolve the repository context.

## Root Cause

`SyncService.mjs` correctly passes `{cwd}` to all 5 of its `execAsync` calls (lines 134-148). `PullRequestService.mjs` does not — likely an oversight from when the service was first written.

## Fix

Add `{cwd: aiConfig.projectRoot}` to both `execAsync` calls in `PullRequestService.mjs`:

- Line 44: `execAsync(\`gh pr checkout ${prNumber}\`, {cwd: aiConfig.projectRoot})`
- Line 89: `execAsync(\`gh pr diff ${prNumber}\`, {cwd: aiConfig.projectRoot})`

## A2A Context (Fat Ticket)

### Discovery Path
Found during PR review of #9894 — the `get_pull_request_diff` MCP tool returned `GH_CLI_ERROR` with exit code 1. The same `gh pr diff 9894` command succeeded when run from the repo root via shell, confirming CWD as the differentiator.

### Scope Boundary
Two-line fix. No architectural changes. No new dependencies.

### Verification
After applying the fix, restart the MCP server and call `get_pull_request_diff` on any merged PR to confirm it returns diff output instead of an error.

## Timeline

- 2026-04-11T20:09:35Z @tobiu assigned to @tobiu
- 2026-04-11T20:09:40Z @tobiu added the `bug` label
- 2026-04-11T20:09:40Z @tobiu added the `ai` label
- 2026-04-11T20:15:12Z @tobiu referenced in commit `4a336f0` - "fix: Add cwd to PullRequestService execAsync calls (#9895)"
- 2026-04-11T20:15:29Z @tobiu cross-referenced by PR #9896
- 2026-04-11T20:19:27Z @tobiu referenced in commit `1113f85` - "fix: Add cwd to PullRequestService execAsync calls (#9895) (#9896)

* chore: ticket sync [skip ci]

* fix: Add cwd to PullRequestService execAsync calls (#9895)"
- 2026-04-11T20:19:27Z @tobiu closed this issue

