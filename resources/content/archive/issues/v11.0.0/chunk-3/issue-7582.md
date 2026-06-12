---
id: 7582
title: Externalize Magic Numbers and Strings in SyncService
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-20T13:30:42Z'
updatedAt: '2025-10-22T22:53:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7582'
author: tobiu
commentsCount: 0
parentIssue: 7564
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-21T09:26:29Z'
---
# Externalize Magic Numbers and Strings in SyncService

The `SyncService` implementation contains several hardcoded "magic numbers" and strings (e.g., API limits, buffer sizes, Markdown delimiters). To improve maintainability and make the service more configurable, these should be extracted and moved to the central `config.mjs` file.

## Acceptance Criteria

1.  The following properties are added to the `githubWorkflow.issueSync` object in `config.mjs`:
    - `maxGhOutputBuffer` (e.g., `10 * 1024 * 1024`)
    - `maxIssues` (e.g., `10000`)
    - `maxReleases` (e.g., `1000`)
    - `commentSectionDelimiter` (e.g., `'

## Timeline

- 2025-10-20T13:30:42Z @tobiu assigned to @tobiu
- 2025-10-20T13:30:43Z @tobiu added the `enhancement` label
- 2025-10-20T13:30:44Z @tobiu added the `ai` label
- 2025-10-20T13:30:44Z @tobiu added parent issue #7564
- 2025-10-21T09:23:40Z @tobiu referenced in commit `9e10ef2` - "Externalize Magic Numbers and Strings in SyncService #7582"
- 2025-10-21T09:26:29Z @tobiu closed this issue

