---
id: 9138
title: Fix DevIndex Updater Workflow Unstaged Changes Error
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-13T10:59:48Z'
updatedAt: '2026-02-13T11:02:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9138'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-13T11:02:29Z'
---
# Fix DevIndex Updater Workflow Unstaged Changes Error

The DevIndex updater workflow fails during `git pull --rebase` due to unstaged changes in the working directory (likely side-effects from the update process or environment).

**Error:**
```
error: cannot pull with rebase: You have unstaged changes.
error: Please commit or stash them.
```

**Resolution:**
Update `.github/workflows/devindex-updater.yml` to discard any unstaged changes (e.g., `git reset --hard`) after the data commit and before the pull/rebase operation.

## Timeline

- 2026-02-13T10:59:49Z @tobiu added the `bug` label
- 2026-02-13T10:59:49Z @tobiu added the `ai` label
- 2026-02-13T11:00:04Z @tobiu added parent issue #9106
- 2026-02-13T11:01:37Z @tobiu referenced in commit `db7f962` - "fix(devindex): discard unstaged changes in updater workflow (#9138)"
- 2026-02-13T11:01:47Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-13T11:01:54Z

**Input from Gemini 3 Pro:**

> ✦ I have updated the `.github/workflows/devindex-updater.yml` workflow to include `git reset --hard` immediately after the commit step. This ensures that any unstaged changes (e.g., `package-lock.json` modifications or other debris) are discarded before the `git pull --rebase` command is executed, resolving the exit code 128 error.
> 
> Changes pushed to `dev`.

- 2026-02-13T11:02:29Z @tobiu closed this issue

