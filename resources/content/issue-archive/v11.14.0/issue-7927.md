---
id: 7927
title: 'Feat: Expose LocalFileService in AI SDK'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-29T15:43:48Z'
updatedAt: '2025-11-29T15:48:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7927'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-29T15:48:18Z'
---
# Feat: Expose LocalFileService in AI SDK

# Feat: Expose LocalFileService in AI SDK

## Context
The Headless PM Agent (Ticket #7916) needs fast, local access to issue content (Epics) without hitting the GitHub API rate limits. The `LocalFileService` already implements `getIssueById`, but it is not currently exported in the standalone SDK (`ai/services.mjs`).

## Requirements
1.  **Import:** Import `LocalFileService.mjs` in `ai/services.mjs`.
2.  **Safety:** Wrap it with `makeSafe` (using the OpenAPI spec for `get_local_issue_by_id`).
3.  **Export:** Export it as `GH_LocalFileService`.

## Impact
Enables "Local First" patterns for autonomous agents running within the repo.


## Timeline

- 2025-11-29T15:43:50Z @tobiu added the `enhancement` label
- 2025-11-29T15:43:50Z @tobiu added the `ai` label
- 2025-11-29T15:45:39Z @tobiu assigned to @tobiu
- 2025-11-29T15:48:06Z @tobiu referenced in commit `ab281fa` - "Feat: Expose LocalFileService in AI SDK #7927"
- 2025-11-29T15:48:18Z @tobiu closed this issue
- 2025-11-29T16:24:29Z @tobiu cross-referenced by #7914

