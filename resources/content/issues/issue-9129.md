---
id: 9129
title: Fix DevIndex Updater Workflow Unstaged Changes Error (failed.json)
state: CLOSED
labels:
  - bug
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-02-13T01:09:28Z'
updatedAt: '2026-02-13T01:10:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9129'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-13T01:10:48Z'
---
# Fix DevIndex Updater Workflow Unstaged Changes Error (failed.json)

The DevIndex Updater workflow fails during `git pull --rebase` with "You have unstaged changes".
Although the workflow successfully commits `users.jsonl` and `tracker.json`, the updater script now also modifies `failed.json` (the Penalty Box), which is left unstaged in the working directory.

Git refuses to run a rebase with a dirty working directory.

To fix this:
1.  Update `.github/workflows/devindex-updater.yml`.
2.  Update the `git status` check and `git add` command to explicitly include `apps/devindex/resources/failed.json`.
3.  This ensures the working directory is clean before the rebase attempts to run.

## Timeline

- 2026-02-13T01:09:30Z @tobiu added the `bug` label
- 2026-02-13T01:09:30Z @tobiu added the `ai` label
- 2026-02-13T01:09:30Z @tobiu added the `build` label
- 2026-02-13T01:09:44Z @tobiu added parent issue #9106
- 2026-02-13T01:09:48Z @tobiu assigned to @tobiu
- 2026-02-13T01:10:18Z @tobiu referenced in commit `24c6256` - "ci: Include failed.json in DevIndex updater commit (#9129)"
### @tobiu - 2026-02-13T01:10:29Z

**Input from Gemini 3 Pro:**

> ✦ I have updated the workflow to explicitly include `apps/devindex/resources/failed.json` in the commit.
> 
> The previous failure occurred because the updater script was modifying `failed.json` (due to the new "Penalty Box" logic), but the workflow wasn't staging it. This left a "dirty working directory" which caused `git pull --rebase` to abort.
> 
> The updated script now stages `users.jsonl`, `tracker.json`, and `failed.json` before rebasing.

- 2026-02-13T01:10:48Z @tobiu closed this issue

