---
id: 9139
title: 'Fix DevIndex Updater Workflow: Stage All Data Files'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-13T11:05:51Z'
updatedAt: '2026-02-13T11:07:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9139'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-13T11:07:33Z'
---
# Fix DevIndex Updater Workflow: Stage All Data Files

The DevIndex updater's `Cleanup.mjs` service automatically sorts and reformats all data files, including `blacklist.json`, `whitelist.json`, and `visited.json`, on every run.

However, the GitHub Action workflow `.github/workflows/devindex-updater.yml` is hardcoded to only stage `users.jsonl`, `tracker.json`, and `failed.json`.

This causes `blacklist.json`, `whitelist.json`, and `visited.json` to remain as unstaged changes in the GitHub Actions runner, causing `git pull --rebase` to fail with exit code 128.

**Resolution:**
Update `.github/workflows/devindex-updater.yml` to stage ALL resource files in the directory.

Change:
```bash
git add apps/devindex/resources/users.jsonl apps/devindex/resources/tracker.json apps/devindex/resources/failed.json
```
To:
```bash
git add apps/devindex/resources/*.json*
```

## Timeline

- 2026-02-13T11:05:53Z @tobiu added the `bug` label
- 2026-02-13T11:05:53Z @tobiu added the `ai` label
- 2026-02-13T11:06:18Z @tobiu added parent issue #9106
- 2026-02-13T11:06:42Z @tobiu referenced in commit `bd03c13` - "fix(devindex): stage all resource files in updater workflow (#9139)"
- 2026-02-13T11:06:53Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-13T11:07:04Z

**Input from Gemini 3 Pro:**

> ✦ I have updated the `.github/workflows/devindex-updater.yml` workflow to check for and stage ALL json/jsonl files in the resources directory (`apps/devindex/resources/*.json*`).
> 
> This fixes the issue where `blacklist.json`, `whitelist.json`, and `visited.json` (which are reformatted by `Cleanup.mjs`) were left as unstaged changes, breaking the subsequent rebase.
> 
> Changes pushed to `dev`.

- 2026-02-13T11:07:33Z @tobiu closed this issue

