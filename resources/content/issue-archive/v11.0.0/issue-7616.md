---
id: 7616
title: 'Neo.ai.mcp.server.github-workflow.SyncService: Switch to Content Hash Tracking'
state: CLOSED
labels:
  - bug
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-10-22T23:59:04Z'
updatedAt: '2025-10-23T00:10:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7616'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-23T00:10:48Z'
---
# Neo.ai.mcp.server.github-workflow.SyncService: Switch to Content Hash Tracking

This ticket documents a critical bug fix and significant improvement implemented in the `Neo.ai.mcp.server.github-workflow.SyncService`.

**Problem:**
Previously, the `SyncService` relied on file modification times (`mtime`) to detect local changes in issue Markdown files before pushing updates to GitHub. This approach was flawed because `mtime` can change due to various non-content-altering operations (e.g., `git checkout`, editor auto-saves, file system syncs). As a result, issues with no actual content changes were frequently pushed to GitHub, leading to unnecessary updates of the `updatedAt` timestamp on GitHub issues and redundant API calls.

**Solution:**
The `SyncService` has been refactored to implement **content hash tracking** for change detection. This involves:
1.  **`#calculateContentHash` Method:** A new private utility method was introduced to generate SHA-256 hashes of file contents.
2.  **`#pullFromGitHub` Enhancement:** When issues are pulled from GitHub and written locally, their content hash is calculated and stored in the synchronization metadata (`.sync-metadata.json`). This hash represents the canonical state of the issue as last synchronized.
3.  **`#pushToGitHub` Rewrite:** The logic for detecting local changes in `#pushToGitHub` was completely rewritten. Instead of comparing `mtime`, it now calculates the hash of the current local file content and compares it against the `contentHash` stored in the metadata. A push to GitHub only occurs if these hashes differ, indicating a genuine content change.

**Impact:**
*   **Critical Bug Fix:** Eliminates false updates to GitHub issues, ensuring that the `updatedAt` timestamp on GitHub accurately reflects actual content modifications.
*   **Improved Performance & Efficiency:** Significantly reduces unnecessary GraphQL API calls to GitHub, conserving rate limits and speeding up the synchronization process for unchanged files.
*   **Enhanced Accuracy:** The synchronization process now precisely reflects only genuine content changes between local files and GitHub.
*   **Increased Robustness:** Improved error handling and logging within `#pushToGitHub` make the process more resilient.

**Files Changed:**
- `ai/mcp/server/github-workflow/services/SyncService.mjs`

**Verification:**
- Verify that modifying a local issue file's content triggers a push to GitHub, and the `updatedAt` timestamp is updated.
- Verify that merely touching a local issue file (without changing content) does *not* trigger a push to GitHub.
- Observe reduced API usage for sync operations when few or no actual content changes have occurred locally.

## Timeline

- 2025-10-22T23:59:04Z @tobiu assigned to @tobiu
- 2025-10-22T23:59:05Z @tobiu added the `bug` label
- 2025-10-22T23:59:06Z @tobiu added the `enhancement` label
- 2025-10-22T23:59:06Z @tobiu added the `ai` label
- 2025-10-22T23:59:06Z @tobiu added the `refactoring` label
- 2025-10-22T23:59:31Z @tobiu referenced in commit `7e3a2e1` - "Neo.ai.mcp.server.github-workflow.SyncService: Switch to Content Hash Tracking #7616"
- 2025-10-23T00:10:48Z @tobiu closed this issue

