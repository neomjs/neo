---
id: 8336
title: Increase IssueSyncer sub-issue sync limit to 100
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-05T14:55:37Z'
updatedAt: '2026-01-05T15:04:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8336'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-05T15:04:10Z'
---
# Increase IssueSyncer sub-issue sync limit to 100

**Problem:**
The `neo-github-workflow` server currently limits the synchronization of sub-issues into epic markdown files to 50 items. This is insufficient for large epics (e.g., #8169) which now exceed this count, causing incomplete local markdown files.

**Solution:**
Increase the `maxSubIssuesPerIssue` configuration in `ai/mcp/server/github-workflow/config.mjs` from 50 to 100.

**Implementation:**
- Update `maxSubIssuesPerIssue` in `ai/mcp/server/github-workflow/config.mjs`.

## Timeline

- 2026-01-05T14:55:38Z @tobiu added the `enhancement` label
- 2026-01-05T14:55:38Z @tobiu added the `ai` label
- 2026-01-05T14:55:57Z @tobiu assigned to @tobiu
- 2026-01-05T14:56:16Z @tobiu referenced in commit `de62239` - "feat(ai): Increase GitHub workflow sub-issue sync limit to 100 (#8336)"
- 2026-01-05T15:04:10Z @tobiu closed this issue

