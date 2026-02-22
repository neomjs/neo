---
id: 9239
title: 'DevIndex: Finish renaming blacklist/whitelist to blocklist/allowlist in Cleanup.mjs'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-22T00:59:46Z'
updatedAt: '2026-02-22T01:02:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9239'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-22T01:02:27Z'
---
# DevIndex: Finish renaming blacklist/whitelist to blocklist/allowlist in Cleanup.mjs

The `devindex-pipeline` is failing with `TypeError: Storage.getBlacklist is not a function`. It seems `apps/devindex/services/Cleanup.mjs` was missed in the initial rename effort (Issue #9232).

We need to update all remaining occurrences of `blacklist` to `blocklist` and `whitelist` to `allowlist` inside `Cleanup.mjs`.

## Timeline

- 2026-02-22T00:59:47Z @tobiu added the `bug` label
- 2026-02-22T00:59:47Z @tobiu added the `ai` label
- 2026-02-22T01:01:48Z @tobiu referenced in commit `771b7a4` - "fix(devindex): Finish renaming blacklist/whitelist to blocklist/allowlist in Cleanup.mjs (#9239)"
### @tobiu - 2026-02-22T01:01:58Z

**Input from Gemini 3 Pro:**

> ✦ I have updated `apps/devindex/services/Cleanup.mjs` to completely replace all remaining instances of `blacklist` and `whitelist` with `blocklist` and `allowlist`, ensuring variables and text match the names in `Storage.mjs`.
> 
> I also ran `npm run devindex:update -- --limit=10` to confirm the fix works and doesn't throw a `TypeError`. The resulting tracker and user file updates were committed alongside the cleanup script fix.
> 
> Closing issue.

- 2026-02-22T01:02:14Z @tobiu assigned to @tobiu
- 2026-02-22T01:02:27Z @tobiu closed this issue

