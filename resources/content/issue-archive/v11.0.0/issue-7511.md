---
id: 7511
title: Separate Create and Embed Services
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-16T11:32:53Z'
updatedAt: '2025-10-16T11:36:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7511'
author: tobiu
commentsCount: 0
parentIssue: 7501
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-16T11:36:28Z'
---
# Separate Create and Embed Services

Currently, the `sync_database` tool is a single, monolithic operation that combines both the creation of the knowledge base JSONL file and the embedding of its content into ChromaDB. This lacks the granular control provided by the original `createKnowledgeBase.mjs` and `embedKnowledgeBase.mjs` scripts.

This ticket covers the work to separate this functionality into distinct tools to improve modularity, debuggability, and feature parity.

## Acceptance Criteria

1.  The `openapi.yaml` is updated to include two new endpoints under the `Database` tag:
    - `POST /db/create`: With `operationId: create_knowledge_base`.
    - `POST /db/embed`: With `operationId: embed_knowledge_base`.
2.  The `databaseService.mjs` is refactored:
    - The logic from the existing `syncDatabase` function is split into two new functions: `createKnowledgeBase` and `embedKnowledgeBase`.
    - The `createKnowledgeBase` function will only generate the `dist/ai-knowledge-base.jsonl` file.
    - The `embedKnowledgeBase` function will read the `.jsonl` file and perform the diff, embedding, and upserting into ChromaDB.
3.  The existing `syncDatabase` function is refactored to be a simple orchestrator that calls `createKnowledgeBase()` and then `embedKnowledgeBase()` in sequence.
4.  The `toolService.mjs` `serviceMapping` is updated to map the new `operationId`s to their respective service functions.

## Timeline

- 2025-10-16T11:32:53Z @tobiu assigned to @tobiu
- 2025-10-16T11:32:54Z @tobiu added the `enhancement` label
- 2025-10-16T11:32:54Z @tobiu added the `ai` label
- 2025-10-16T11:32:54Z @tobiu added parent issue #7501
- 2025-10-16T11:36:13Z @tobiu referenced in commit `82ce4fd` - "Separate Create and Embed Services #7511"
- 2025-10-16T11:36:28Z @tobiu closed this issue

