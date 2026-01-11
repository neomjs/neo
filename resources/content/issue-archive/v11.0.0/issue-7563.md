---
id: 7563
title: Standardize ChromaDB Collection Naming Convention
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-19T23:24:12Z'
updatedAt: '2025-10-19T23:25:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7563'
author: tobiu
commentsCount: 0
parentIssue: 7536
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-19T23:25:06Z'
---
# Standardize ChromaDB Collection Naming Convention

The ChromaDB collection names in `ai/mcp/server/config.mjs` use inconsistent separators. The `memoryCore` collections use a hyphen (`neo-agent-memory`), while the `knowledgeBase` collection uses an underscore (`neo_knowledge`).

To standardize our naming convention, the `knowledgeBase.collectionName` should be updated to use a hyphen.

## Acceptance Criteria

1.  In `ai/mcp/server/config.mjs`, the `knowledgeBase.collectionName` property is changed from `'neo_knowledge'` to `'neo-knowledge-base'`.
2.  Any services that might have this value hardcoded (though they should not) are checked and updated.
3.  This change implies that the old collection will be orphaned and a new one will be created on the next sync, which is the desired outcome for a clean switch.

## Timeline

- 2025-10-19T23:24:12Z @tobiu assigned to @tobiu
- 2025-10-19T23:24:13Z @tobiu added the `enhancement` label
- 2025-10-19T23:24:13Z @tobiu added parent issue #7536
- 2025-10-19T23:24:14Z @tobiu added the `ai` label
- 2025-10-19T23:24:56Z @tobiu referenced in commit `59f3602` - "Standardize ChromaDB Collection Naming Convention #7563"
- 2025-10-19T23:25:06Z @tobiu closed this issue

