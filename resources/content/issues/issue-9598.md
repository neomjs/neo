---
id: 9598
title: Force Node 24 for GitHub Actions to resolve deprecation warnings
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-03-30T10:25:31Z'
updatedAt: '2026-03-30T10:26:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9598'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-30T10:26:39Z'
---
# Force Node 24 for GitHub Actions to resolve deprecation warnings

## Problem
Although we upgraded the GitHub actions to their latest major versions, GitHub Actions environments still default to executing them on Node.js 20. This continues causing our runs to throw deprecation warnings.

## Proposed Solution
Inject the `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` environment variable at the workflow level for all workflows inside `.github/workflows/` so that the modern actions opt into the Node 24 runner properly.

## Timeline

- 2026-03-30T10:25:33Z @tobiu added the `enhancement` label
- 2026-03-30T10:25:33Z @tobiu added the `ai` label
- 2026-03-30T10:26:36Z @tobiu referenced in commit `e6af733` - "ci: Force Node 24 for GitHub Actions to resolve deprecation warnings (#9598)"
- 2026-03-30T10:26:37Z @tobiu assigned to @tobiu
- 2026-03-30T10:26:39Z @tobiu closed this issue

