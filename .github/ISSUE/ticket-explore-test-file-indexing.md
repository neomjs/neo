# Ticket: Explore and Implement Test File Indexing in Knowledge Base

GH ticket id: #7266

**Assignee:**
**Status:** To Do

**Parent Epic:** epic-enhance-workflow-with-mandatory-unit-testing.md

## Description

Once all unit tests have been migrated to the Playwright runner, their value as documentation can be amplified by making them searchable. This task is to explore the best method for including the Playwright test files (`*.spec.mjs`) in the ChromaDB knowledge base and to implement the chosen solution.

## Acceptance Criteria

1.  Investigate the `ai:build-kb` script to determine how to include `.spec.mjs` files.
2.  Modify the script and any related configuration to add the test files to the knowledge base.
3.  Verify that queries made via `npm run ai:query` can successfully return results from within the test files.
