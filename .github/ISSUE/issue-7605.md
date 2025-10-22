---
id: 7605
title: Add Configurable Prefix for Release Note Filenames
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-22T12:04:12Z'
updatedAt: '2025-10-22T12:07:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7605'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-22T12:07:18Z'
---
# Add Configurable Prefix for Release Note Filenames

**Reported by:** @tobiu on 2025-10-22

Currently, the `SyncService` creates filenames for synced issues with a configurable prefix (`issue-`) to prevent filenames from starting with a number. However, synced release notes (e.g., `10.0.0.md`) are created without a prefix, leading to inconsistent naming conventions within the `.github` directory.

To improve consistency, we should add a configurable prefix for release note filenames, similar to how issue filenames are handled. A prefix like `v` would be a sensible default.

## Acceptance Criteria

1.  A new configuration property, `releaseFilenamePrefix`, is added to the `issueSync` object in `ai/mcp/server/github-workflow/config.mjs`. A default value of `'v'` should be considered.
2.  The `#syncReleaseNotes` method in `SyncService.mjs` is updated to use this new prefix when constructing the filename for each release note.
    -   Example: `v10.0.0.md` instead of `10.0.0.md`.

