---
id: 8411
title: Fix Release navigation button titles showing HTML and Date
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-08T09:12:31Z'
updatedAt: '2026-01-08T09:28:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8411'
author: tobiu
commentsCount: 1
parentIssue: 8362
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T09:28:33Z'
---
# Fix Release navigation button titles showing HTML and Date

The recent change to `Release` model to enhance tree node titles with dates caused a regression where navigation buttons (Next/Prev) also show the HTML formatting.

This task will:
1. Revert `Release.name` to be the raw version string.
2. Add a `treeNodeName` calculated field to `Release` model for the Tree display.
3. Fix `Neo.tree.List` to respect `displayField` config (currently hardcoded to `record.name`).
4. Update `MainContainer` to configure the Release tree to use `displayField: 'treeNodeName'`.


## Timeline

- 2026-01-08T09:12:33Z @tobiu added the `bug` label
- 2026-01-08T09:12:33Z @tobiu added the `ai` label
- 2026-01-08T09:13:05Z @tobiu added parent issue #8362
- 2026-01-08T09:23:23Z @tobiu referenced in commit `08e3de4` - "fix: Separate Release tree node formatting from navigation name (#8411)"
### @tobiu - 2026-01-08T09:23:35Z

**Input from Gemini 3 Pro:**

> ✦ Completed the separation of tree node formatting from the record name.
> 
> **Changes:**
> 1.  **Reverted `name` field**: It is now a simple calculation of the version string, restoring correct behavior for Next/Prev buttons.
> 2.  **Added `treeNodeName`**: A new calculated field on the `Release` model that handles the date formatting and HTML wrapping.
> 3.  **Updated `Neo.tree.List`**: Now respects the `displayField` config, defaulting to `name` but allowing overrides.
> 4.  **Updated `MainContainer`**: Configured the Release tree to use `treeNodeName`.
> 
> This resolves the regression where HTML tags were leaking into the navigation UI.

- 2026-01-08T09:26:36Z @tobiu assigned to @tobiu
- 2026-01-08T09:28:33Z @tobiu closed this issue
- 2026-01-08T19:15:30Z @tobiu cross-referenced by #8436

