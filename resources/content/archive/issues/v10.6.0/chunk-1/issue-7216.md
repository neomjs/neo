---
id: 7216
title: Enhance AI Knowledge Base with Blog Content
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-19T12:32:18Z'
updatedAt: '2025-09-19T12:53:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7216'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-09-19T12:53:14Z'
---
# Enhance AI Knowledge Base with Blog Content

## Description

The AI knowledge base currently sources its information from JSDoc comments and the learning guides defined in `learn/tree.json`. This provides a strong foundation but omits a valuable, often more current, source of information: the blog posts located in `learn/blog`.

This ticket proposes enhancing the knowledge base by including these blog posts in the AI's searchable content.

## The Plan

1.  **Update `learn/tree.json`**:
    *   Dynamically read the contents of the `learn/blog` directory.
    *   For each blog post, add a corresponding entry to the `learn/tree.json` file.
    *   These new entries should be flagged with `"hidden": true` to prevent them from appearing in the main navigation UI of the learning center, while still making them available for parsing.

2.  **Verify Knowledge Base Integration**:
    *   Ensure the `createKnowledgeBase.mjs` script correctly parses these new, hidden entries from the updated `tree.json`.
    *   After rebuilding the knowledge base (`npm run ai:build-kb`), confirm that blog content is being embedded and can be retrieved via queries.

## Acceptance Criteria

*   A script or manual process is in place to add blog posts from `learn/blog` to `learn/tree.json` with the `"hidden": true` flag.
*   The `createKnowledgeBase.mjs` script successfully processes the hidden blog entries.
*   Queries made via `npm run ai:query` can return blog posts as relevant source files.

## Timeline

- 2025-09-19T12:32:18Z @tobiu assigned to @tobiu
- 2025-09-19T12:32:20Z @tobiu added the `enhancement` label
- 2025-09-19T12:52:59Z @tobiu referenced in commit `920b8a1` - "Enhance AI Knowledge Base with Blog Content #7216"
### @tobiu - 2025-09-19T12:53:14Z

<img width="977" height="501" alt="Image" src="https://github.com/user-attachments/assets/230fd0b8-669f-4a8f-977b-a5076f735d15" />

- 2025-09-19T12:53:14Z @tobiu closed this issue

