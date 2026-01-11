---
id: 7363
title: Create `clearSummaries.mjs` script for development
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-05T10:02:03Z'
updatedAt: '2025-10-05T10:03:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7363'
author: tobiu
commentsCount: 0
parentIssue: 7316
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-05T10:03:06Z'
---
# Create `clearSummaries.mjs` script for development

During development and testing of the session summarization feature, a utility script was needed to quickly clear out the session summaries collection in ChromaDB. This ticket documents the creation of this helper script.

## Acceptance Criteria

1.  A new script `buildScripts/ai/clearSummaries.mjs` is created.
2.  The script connects to the ChromaDB instance defined in `aiConfig.mjs`.
3.  It deletes and immediately recreates the `sessions` collection.
4.  The script is intended for development use and will not be added to `package.json` scripts.

## Timeline

- 2025-10-05T10:02:03Z @tobiu assigned to @tobiu
- 2025-10-05T10:02:04Z @tobiu added parent issue #7316
- 2025-10-05T10:02:05Z @tobiu added the `enhancement` label
- 2025-10-05T10:02:05Z @tobiu added the `ai` label
- 2025-10-05T10:02:56Z @tobiu referenced in commit `76c50be` - "Create clearSummaries.mjs script for development #7363"
- 2025-10-05T10:03:06Z @tobiu closed this issue

