---
id: 7300
title: Refactor Knowledge Base Schema to Fix Type Regression
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-09-28T13:13:53Z'
updatedAt: '2025-09-28T13:31:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7300'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-09-28T13:31:00Z'
---
# Refactor Knowledge Base Schema to Fix Type Regression

The AI query tool (`npm run ai:query`) fails for `--type example` because the knowledge base creation script does not correctly assign a high-level `type` to items originating from the `/examples` directory. The current implementation uses `type` to store the specific code construct (`class`, `method`), creating a conflict.

This ticket refactors the knowledge base schema to solve this regression and make the data model more robust.

### Tasks:

1.  **Modify `buildScripts/ai/createKnowledgeBase.mjs`:**
    -   For each chunk generated from the JSDoc output (`all.json`), add a `type` property (`src`, `example`, etc.) based on its source file path.
    -   Rename the existing `type` property (which currently holds `class`, `method`, etc.) to `kind` to avoid conflicts.
    -   For non-JSDoc chunks (guides, releases, tickets), ensure they also have both a `type` and a `kind` property (where both can have the same value, e.g., `type: 'guide'`, `kind: 'guide'`).

2.  **Verify `buildScripts/ai/queryKnowledgeBase.mjs`:**
    -   Confirm that the existing query logic, which filters on the `type` property, works correctly with the new schema without modification.

## Timeline

- 2025-09-28T13:13:53Z @tobiu assigned to @tobiu
- 2025-09-28T13:13:55Z @tobiu added the `bug` label
- 2025-09-28T13:30:56Z @tobiu referenced in commit `eca8527` - "Refactor Knowledge Base Schema to Fix Type Regression #7300"
- 2025-09-28T13:31:00Z @tobiu closed this issue

