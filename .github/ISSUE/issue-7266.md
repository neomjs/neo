---
id: 7266
title: Explore and Implement Test File Indexing in Knowledge Base
state: OPEN
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-27T12:05:31Z'
updatedAt: '2025-09-27T12:34:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7266'
author: tobiu
commentsCount: 0
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
---
# Explore and Implement Test File Indexing in Knowledge Base

**Reported by:** @tobiu on 2025-09-27

---

**Parent Issue:** #7262 - Enhance Development Workflow with Mandatory Unit Testing

---

Once all unit tests have been migrated to the Playwright runner, their value as documentation can be amplified by making them searchable. This task is to explore the best method for including the Playwright test files (`*.spec.mjs`) in the ChromaDB knowledge base and to implement the chosen solution.

## Acceptance Criteria

1.  Investigate the `ai:build-kb` script to determine how to include `.spec.mjs` files.
2.  Modify the script and any related configuration to add the test files to the knowledge base.
3.  Verify that queries made via `npm run ai:query` can successfully return results from within the test files.

