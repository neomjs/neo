---
id: 7620
title: Optimize SyncService by Scoping Push and Hashing Releases
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-23T12:05:17Z'
updatedAt: '2025-10-23T12:38:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7620'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-23T12:38:09Z'
---
# Optimize SyncService by Scoping Push and Hashing Releases

The `SyncService` `runFullSync` operation is currently slow (~4.7s) even when no local or remote changes have occurred. This is due to two primary inefficiencies in the push and pull phases.

### Problem Areas

1.  **Inefficient Push Scope:** The `#pushToGitHub` method currently scans all local issue files for changes, including thousands of files in the `ISSUE_ARCHIVE` directory. This is unnecessary, as archived issues can be considered immutable. The file I/O and hashing for these archived files is the main contributor to the slowdown.
2.  **Unconditional Release Writes:** The `#syncReleaseNotes` method unconditionally rewrites all local release note files on every run, regardless of whether the content has changed on GitHub. This causes unnecessary disk I/O.

### Proposed Solution

This ticket proposes a two-pronged approach to optimize the sync process:

**1. Limit Push Scope to Active Issues**

-   Modify the `#scanLocalFiles` method to **only** scan the active issues directory (`issueSyncConfig.issuesDir`).
-   The `issueSyncConfig.archiveDir` will be completely ignored during the push phase.
-   This change is based on the strategic assumption that archived issues are immutable and will not be edited locally. This single change will provide the most significant performance improvement by drastically reducing the number of files to process.

**2. Implement Content Hashing for Release Notes**

-   In the `#syncReleaseNotes` method, for each release fetched from GitHub, generate a SHA-256 content hash of the complete Markdown content (frontmatter + body) that would be written to disk.
-   Store these hashes in the `.sync-metadata.json` file. The existing `releases` cache can be enhanced to store an object with the release data and the content hash.
-   Before writing a release note file, compare the newly generated hash with the hash stored in the metadata from the previous run.
-   The file will only be written if the hash is different, or if no previous hash exists for that release tag.

### Acceptance Criteria

-   The `runFullSync` duration is significantly reduced when no changes are present.
-   The `#pushToGitHub` operation no longer scans or processes files within the `ISSUE_ARCHIVE` directory.
-   The `#syncReleaseNotes` operation only writes files to disk when the corresponding release content on GitHub has actually changed.
-   The `.sync-metadata.json` file is updated to store content hashes for release notes to enable this change detection.

## Timeline

- 2025-10-23T12:05:17Z @tobiu assigned to @tobiu
- 2025-10-23T12:05:18Z @tobiu added the `enhancement` label
- 2025-10-23T12:05:18Z @tobiu added the `ai` label
- 2025-10-23T12:28:49Z @tobiu referenced in commit `4ec87f7` - "Optimize SyncService by Scoping Push and Hashing Releases #7620"
- 2025-10-23T12:37:35Z @tobiu referenced in commit `159bca2` - "#7620 minor formatting cleanup"
- 2025-10-23T12:38:09Z @tobiu closed this issue

