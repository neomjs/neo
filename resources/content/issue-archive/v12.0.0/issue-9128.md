---
id: 9128
title: Implement Adaptive Chunking for DevIndex Updater to Fix 504 Timeouts
state: CLOSED
labels:
  - bug
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-13T01:01:41Z'
updatedAt: '2026-02-13T01:06:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9128'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-13T01:06:07Z'
---
# Implement Adaptive Chunking for DevIndex Updater to Fix 504 Timeouts

I have verified that the user `davidhu2000` is **NOT** a heavy public user (created 2015, 46 repos, 182 followers), but fetching their contribution data in a 4-year chunk consistently fails with a `504 Gateway Timeout`.

However, fetching a **1-year chunk succeeds** instantly.

This confirms that the issue is likely due to a specific data quirk or hidden complexity (e.g., massive private contributions) that makes the 4-year query too expensive for GitHub to compute in one go.

**Solution: Adaptive Chunking**
We will modify `Updater.mjs` to implement a smart fallback:
1.  Attempt to fetch the standard 4-year chunk.
2.  If it fails (throws an error), catch it.
3.  Log a warning and switch to fetching the years one by one for that specific chunk.

This ensures the updater remains fast for normal users while automatically handling these edge cases without crashing.

## Timeline

- 2026-02-13T01:01:42Z @tobiu added the `bug` label
- 2026-02-13T01:01:42Z @tobiu added the `enhancement` label
- 2026-02-13T01:01:42Z @tobiu added the `ai` label
- 2026-02-13T01:01:51Z @tobiu assigned to @tobiu
- 2026-02-13T01:02:10Z @tobiu added parent issue #9106
- 2026-02-13T01:05:07Z @tobiu referenced in commit `18362ce` - "feat(devindex): Implement adaptive chunking for updater (#9128)"
### @tobiu - 2026-02-13T01:05:23Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the "Adaptive Chunking" logic in `Updater.mjs`.
> 
> Now, if a 4-year chunk fetch fails (e.g., due to a timeout), the updater will:
> 1.  Log a warning: `[Updater] [${username}] Batch failed (2022-2025). Falling back to single years...`
> 2.  Switch to fetching each year individually (2022, then 2023, etc.).
> 3.  If an individual year fails, it will correctly propagate the error and mark the user as failed.
> 
> This ensures robust handling of users like `davidhu2000` who were timing out on large batches.

- 2026-02-13T01:06:07Z @tobiu closed this issue
- 2026-02-13T01:24:08Z @tobiu cross-referenced by #9130

