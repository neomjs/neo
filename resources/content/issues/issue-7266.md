---
id: 7266
title: Explore and Implement Test File Indexing in Knowledge Base
state: OPEN
labels:
  - enhancement
  - no auto close
  - ai
assignees:
  - tobiu
createdAt: '2025-09-27T12:05:31Z'
updatedAt: '2025-11-04T10:56:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7266'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Explore and Implement Test File Indexing in Knowledge Base

Once all unit tests have been migrated to the Playwright runner, their value as documentation can be amplified by making them searchable. This task is to explore the best method for including the Playwright test files (`*.spec.mjs`) in the ChromaDB knowledge base and to implement the chosen solution.

## Acceptance Criteria

1.  Investigate the `ai:build-kb` script to determine how to include `.spec.mjs` files.
2.  Modify the script and any related configuration to add the test files to the knowledge base.
3.  Verify that queries made via `npm run ai:query` can successfully return results from within the test files.

## Timeline

- 2025-09-27T12:05:33Z @tobiu added the `enhancement` label
- 2025-09-27T12:05:33Z @tobiu added parent issue #7262
- 2025-09-27T12:34:13Z @tobiu assigned to @tobiu
### @tobiu - 2025-11-04T10:55:51Z

detaching the ticket from the epic.

- 2025-11-04T10:56:04Z @tobiu added the `no auto close` label
- 2025-11-04T10:56:04Z @tobiu added the `ai` label
- 2025-11-04T10:56:16Z @tobiu removed parent issue #7262

