---
id: 9124
title: Robustify DevIndex Updater Workflow against Remote Changes
state: CLOSED
labels:
  - enhancement
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-02-12T21:55:45Z'
updatedAt: '2026-02-12T21:56:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9124'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-12T21:56:45Z'
---
# Robustify DevIndex Updater Workflow against Remote Changes

The `devindex-updater` workflow failed because the remote `dev` branch diverged (force push or new commits) during the 6-minute execution of the update script.

**Error:**
```
! [rejected]        HEAD -> dev (non-fast-forward)
```

**Solution:**
Add a `git pull origin dev --rebase` step before the final commit/push action. This ensures the local updates are replayed on top of the latest remote state, resolving the divergence.

**Implementation:**
- Added `git pull origin dev --rebase` to `.github/workflows/devindex-updater.yml` before the commit step.
- Configured git user identity for the pull operation.

## Timeline

- 2026-02-12T21:55:46Z @tobiu added the `enhancement` label
- 2026-02-12T21:55:46Z @tobiu added the `ai` label
- 2026-02-12T21:55:46Z @tobiu added the `build` label
- 2026-02-12T21:56:25Z @tobiu referenced in commit `51db6d2` - "ci: Robustify DevIndex Updater with git pull --rebase (#9124)"
- 2026-02-12T21:56:35Z @tobiu assigned to @tobiu
- 2026-02-12T21:56:46Z @tobiu closed this issue

