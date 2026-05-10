---
id: 7603
title: 'Bug: Issue Archiving Logic Incorrectly Buckets Recently Closed Issues'
state: CLOSED
labels:
  - bug
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-10-22T11:39:52Z'
updatedAt: '2025-10-22T11:42:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7603'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-22T11:42:48Z'
---
# Bug: Issue Archiving Logic Incorrectly Buckets Recently Closed Issues

During testing of the `sync_issues` tool, a bug was discovered in the logic that determines the file path for closed issues. The `SyncService` was incorrectly moving recently closed issues (i.e., issues closed after the latest release) into a fallback `unversioned` archive folder.

The correct behavior should be for these issues to remain in the main `.github/ISSUES` directory, alongside open issues, until a new release is published. An issue should only be considered "archived" once a subsequent release has been created.

### Root Cause

The `#getIssuePath` method in `SyncService.mjs` had two flaws:

1.  The release list was sorted in descending order, causing the `.find()` method to select the latest possible release instead of the next chronological one.
2.  The logic had a fallback that would move any closed issue that didn't match a release into an archive folder (`unversioned`), instead of leaving it in the active issues directory.

## Resolution

The `#getIssuePath` method was refactored with the following logic:

1.  **Correct Sort Order:** The release list fetched by `#fetchAndCacheReleases` is now sorted in ascending (chronological) order.
2.  **Improved Archiving Logic:**
    *   An issue with a `milestone` is still archived immediately under that milestone when closed.
    *   A closed issue **without** a milestone is now handled correctly:
        *   If a release is found that was published *after* the issue was closed, the issue is moved to that release's archive folder.
        *   If **no** subsequent release is found, the issue correctly remains in the main `.github/ISSUES` directory.

This ensures that the local file structure accurately reflects the development lifecycle, where closed issues are only archived after they have been included in a release.

## Timeline

- 2025-10-22T11:39:52Z @tobiu assigned to @tobiu
- 2025-10-22T11:39:53Z @tobiu added the `bug` label
- 2025-10-22T11:39:53Z @tobiu added the `ai` label
- 2025-10-22T11:39:54Z @tobiu added the `refactoring` label
- 2025-10-22T11:40:57Z @tobiu referenced in commit `9bc008d` - "Bug: Issue Archiving Logic Incorrectly Buckets Recently Closed Issues #7603"
- 2025-10-22T11:42:48Z @tobiu closed this issue

