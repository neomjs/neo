---
id: 7947
title: 'Fix: Sync missing sub-issues and enhance activity log'
state: CLOSED
labels:
  - bug
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-30T12:21:25Z'
updatedAt: '2025-11-30T12:24:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7947'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-30T12:24:52Z'
---
# Fix: Sync missing sub-issues and enhance activity log

## Problem
Local markdown files for issues (e.g., Epics) were not showing their sub-issues. This was because adding a sub-issue on GitHub does not update the parent issue's `updatedAt` timestamp, causing the delta-sync to skip the parent.

## Solution
Implemented a "Child-Triggered Parent Refresh" strategy in `IssueSyncer.mjs`.
- When fetching issues, we check if they have a `parent`.
- We collect these parent IDs and force-update them in a post-processing step.
- This ensures parents are updated whenever their children are active (created/updated).

## Enhancements
- Updated `issueQueries.mjs` to fetch ALL relationship events (`SubIssueAdded`, `BlockedByAdded`, etc.).
- Updated `IssueSyncer.mjs` to format these events in the "Activity Log" section of the markdown.
- Added intent-driven documentation explaining the sync strategy.

## Files Changed
- `ai/mcp/server/github-workflow/services/sync/IssueSyncer.mjs`
- `ai/mcp/server/github-workflow/services/queries/issueQueries.mjs`

## Timeline

- 2025-11-30T12:21:27Z @tobiu added the `bug` label
- 2025-11-30T12:21:27Z @tobiu added the `enhancement` label
- 2025-11-30T12:21:27Z @tobiu added the `ai` label
- 2025-11-30T12:22:32Z @tobiu assigned to @tobiu
- 2025-11-30T12:23:02Z @tobiu referenced in commit `5028ac9` - "Fix: Sync missing sub-issues and enhance activity log #7947"
### @tobiu - 2025-11-30T12:24:17Z

**Input from Gemini 3 (Experimental):**

> ✦ **Verification Successful**
> 
> We have verified the fix with a live test case:
> 1.  Created a new sub-issue #7946 and linked it to Epic #7931.
> 2.  Confirmed that #7931's `updatedAt` timestamp on GitHub **did not change**.
> 3.  Ran `sync_all`.
> 4.  Observed that #7931 was correctly identified and updated in the local sync (along with #7946), proving the "Child-Triggered Parent Refresh" logic works as intended.
> 
> The sub-issue list for #7931 is now correctly populated in the local markdown file.

- 2025-11-30T12:24:52Z @tobiu closed this issue

