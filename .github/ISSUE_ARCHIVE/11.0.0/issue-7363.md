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
closedAt: '2025-10-05T10:03:06Z'
---
# Create `clearSummaries.mjs` script for development

**Reported by:** @tobiu on 2025-10-05

---

**Parent Issue:** #7316 - AI Knowledge Evolution

---

During development and testing of the session summarization feature, a utility script was needed to quickly clear out the session summaries collection in ChromaDB. This ticket documents the creation of this helper script.

## Acceptance Criteria

1.  A new script `buildScripts/ai/clearSummaries.mjs` is created.
2.  The script connects to the ChromaDB instance defined in `aiConfig.mjs`.
3.  It deletes and immediately recreates the `sessions` collection.
4.  The script is intended for development use and will not be added to `package.json` scripts.

