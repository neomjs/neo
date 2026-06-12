---
id: 7732
title: 'bug: sync_all does not move existing local issues to archive on new release'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-11-09T10:31:59Z'
updatedAt: '2025-11-09T13:49:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7732'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-09T13:49:14Z'
---
# bug: sync_all does not move existing local issues to archive on new release

### Summary

The `sync_all` tool fails to move existing local issues from the `.github/ISSUE/` directory to the appropriate release archive folder when a new release is synced.

### Steps to Reproduce

1.  Have a closed issue with a milestone (e.g., `v11.0.0`) that already exists as a local file in `.github/ISSUE/`.
2.  Publish the corresponding release (`v11.0.0`) on GitHub.
3.  Run the `sync_all` tool.

### Expected Behavior

The local issue file is moved from `.github/ISSUE/` to `.github/ISSUE_ARCHIVE/11.0.0/`. The local metadata in `.github/.sync-metadata.json` is updated with the new file path.

### Actual Behavior

The local issue file is not moved. The sync logic appears to skip re-evaluating the location of local files if their content hash has not changed, even though its milestone now dictates it should be archived.

### Technical Analysis

The bug is likely within the `IssueSyncer` service. The current logic prioritizes content hash checking over location validation. The logic needs to be refactored to ensure that for every issue pulled from GitHub, its correct local path (active vs. archived) is determined based on its milestone, and the local file is moved if its current path does not match the expected path. This location check must happen independently of the content sync check.

## Timeline

- 2025-11-09T10:32:00Z @tobiu added the `bug` label
- 2025-11-09T10:32:00Z @tobiu added the `ai` label
- 2025-11-09T10:40:33Z @tobiu assigned to @tobiu
- 2025-11-09T10:51:55Z @tobiu referenced in commit `931f151` - "bug: sync_all does not move existing local issues to archive on new release #7732"
- 2025-11-09T10:59:24Z @tobiu referenced in commit `08198d3` - "#7732 safety net"
- 2025-11-09T11:28:44Z @tobiu referenced in commit `e135746` - "#7732 new test"
- 2025-11-09T12:29:46Z @tobiu referenced in commit `acd0c17` - "#7732 WIP"
- 2025-11-09T13:40:11Z @tobiu referenced in commit `94bf401` - "#7732"
- 2025-11-09T13:49:14Z @tobiu closed this issue

