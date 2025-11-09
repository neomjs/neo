---
id: 7218
title: Refactor AI Query Scoring for Performance
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-20T09:36:39Z'
updatedAt: '2025-09-20T09:51:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7218'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-09-20T09:51:32Z'
---
# Refactor AI Query Scoring for Performance

**Reported by:** @tobiu on 2025-09-20

## Problem

The `queryKnowledgeBase.mjs` script currently reloads and processes the entire knowledge base JSON file on every query. This is slow and memory-intensive, especially as the knowledge base grows.

## Solution

1.  **Pre-process Inheritance:** In `embedKnowledgeBase.mjs`, load the full knowledge base, build an inheritance map, and then pre-calculate the full `inheritanceChain` for each chunk. Store this `inheritanceChain` array in the metadata for each chunk in ChromaDB.
2.  **Simplify Query Script:** Modify `queryKnowledgeBase.mjs` to be lightweight and fast.
    *   Remove the code that reads the local JSON file entirely.
    *   For scoring, use the `inheritanceChain` provided in the metadata from the query result. This avoids expensive file I/O and graph traversal on every query.
    *   Keep the dynamic keyword-based scoring logic within the query script, as it depends on the user's input.

## Benefits

- Significantly faster and more memory-efficient queries.
- Better separation of concerns (`create` -> `score & embed` -> `query`).
- More scalable architecture.

