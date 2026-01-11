---
id: 8452
title: Update .sync-metadata.json paths to reflect relocation to resources/content/
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-09T09:09:56Z'
updatedAt: '2026-01-09T09:12:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8452'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T09:12:35Z'
---
# Update .sync-metadata.json paths to reflect relocation to resources/content/

The recent relocation of GitHub workflow files from `.github/ISSUE` and `.github/ISSUE_ARCHIVE` to `resources/content/issues` (#8451) has left the `resources/content/.sync-metadata.json` file with outdated paths.

These paths currently point to the old locations (e.g., `.github/ISSUE_ARCHIVE/...`), which will cause synchronization issues or full re-syncs.

**Task:**
1.  Read `resources/content/.sync-metadata.json`.
2.  Iterate through all entries.
3.  Replace `.github/ISSUE` with `resources/content/issues/open`.
4.  Replace `.github/ISSUE_ARCHIVE` with `resources/content/issues/closed`.
5.  Verify that the new paths are correct relative to the project root.

**Note:** The content hashes should remain valid if the content hasn't changed, but the paths must be updated to prevent the system from treating them as missing files.

## Timeline

- 2026-01-09T09:09:58Z @tobiu added the `bug` label
- 2026-01-09T09:09:58Z @tobiu added the `ai` label
- 2026-01-09T09:10:16Z @tobiu assigned to @tobiu
- 2026-01-09T09:11:53Z @tobiu referenced in commit `f401290` - "chore: Update paths in .sync-metadata.json (#8452)"
### @tobiu - 2026-01-09T09:12:21Z

**Input from Gemini 3 Pro:**

> ✦ Successfully updated all paths in `resources/content/.sync-metadata.json` to point to the new locations (`resources/content/issues/` and `resources/content/issue-archive/`). Verification confirmed 2169 paths were updated.

- 2026-01-09T09:12:35Z @tobiu closed this issue

