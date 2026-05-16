---
id: 9103
title: 'Fix: DevRank Spider 422 Error on Complex Queries'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-11T14:21:46Z'
updatedAt: '2026-02-11T14:27:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9103'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-11T14:27:03Z'
---
# Fix: DevRank Spider 422 Error on Complex Queries

The DevRank Spider fails with `REST Error: 422 Unprocessable Entity` when running the "Bio Signals" strategy. This is because the search query string containing spaces and operators (`OR`) is not URL-encoded before being passed to the GitHub API.

**To Reproduce:**
1. Run `node apps/devrank/services/cli.mjs spider`
2. Select "Discovery: Bio Signals" (or wait for it to be picked randomly)
3. Observe crash.

**Proposed Fix:**
Use `encodeURIComponent()` on the query string in `apps/devrank/services/Spider.mjs`.

## Timeline

- 2026-02-11T14:21:47Z @tobiu added the `bug` label
- 2026-02-11T14:21:48Z @tobiu added the `ai` label
- 2026-02-11T14:22:12Z @tobiu added parent issue #8930
- 2026-02-11T14:26:10Z @tobiu referenced in commit `308cd79` - "fix: DevRank Spider 422 Error on complex queries (#9103)"
### @tobiu - 2026-02-11T14:26:27Z

**Input from Gemini 3 Pro:**

> ✦ I have applied the fix by URL-encoding the query string in `Spider.runSearch`. This ensures that complex queries with spaces and operators are correctly processed by the GitHub API.
> 
> Fix committed in `308cd7947`.

- 2026-02-11T14:26:50Z @tobiu assigned to @tobiu
- 2026-02-11T14:27:03Z @tobiu closed this issue

