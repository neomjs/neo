---
id: 7473
title: 'REFACTOR: Assign `type: ''blog''` directly in `createKnowledgeBase.mjs`'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-13T08:46:11Z'
updatedAt: '2025-10-13T10:02:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7473'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-13T10:02:15Z'
---
# REFACTOR: Assign `type: 'blog'` directly in `createKnowledgeBase.mjs`

**Reported by:** @tobiu on 2025-10-13

This ticket is a follow-up to PR #7472, which fixed a bug where blog posts were not being found by the AI query system. The PR implemented a workaround on the query-side (`queryKnowledgeBase.mjs`) to correctly find blog posts.

This ticket will address the root cause of the issue by refactoring the data creation script (`buildScripts/ai/createKnowledgeBase.mjs`) to assign the correct `type` to blog posts during the initial indexing process.

## Problem

Currently, `createKnowledgeBase.mjs` processes all markdown files from `learn/tree.json` and assigns them `type: 'guide'`. To differentiate blog posts, it adds a flag `isBlog: true`. This forces the query logic to contain a special condition to translate a search for `type: 'blog'` into a search for `{type: 'guide', isBlog: 'true'}`.

This approach is not ideal because:
1.  It makes the data model less clear. Blog posts are a distinct content type, not a subtype of a guide.
2.  It adds unnecessary complexity to the query logic, making it harder to maintain.

## Proposed Solution

The solution is to modify the data creation script to assign the correct type at the source.

1.  **In `buildScripts/ai/createKnowledgeBase.mjs`:**
    *   Locate the loop that processes the `learnTree` data.
    *   Inside the loop, add a condition to check if an item's `parentId` is `'Blog'`.
    *   If it is, set the `type` of the generated chunk to `'blog'`.
    *   Remove the now-redundant `isBlog` property from the chunk.

2.  **In `buildScripts/ai/queryKnowledgeBase.mjs`:**
    *   Remove the special `if (type === 'blog')` condition that was added in PR #7472.
    *   The generic `whereClause = {type: type}` will now work correctly for blog posts as well.

## Acceptance Criteria

1.  `createKnowledgeBase.mjs` is updated to generate chunks with `type: 'blog'` for all blog posts.
2.  The `isBlog` property is no longer present in the generated knowledge base chunks.
3.  `queryKnowledgeBase.mjs` is simplified, and the workaround for blog queries is removed.
4.  After rebuilding the knowledge base, running `npm run ai:query -- -q "<search-term>" -t blog` successfully returns results from blog posts.

## Comments

### @harikrishna-au - 2025-10-13 09:38

@tobiu assign me this


### @tobiu - 2025-10-13 10:02

this one is already resolved via: https://github.com/neomjs/neo/commit/82617a3a208c3902ae64251e090a552f840b8ddf, as mentioned inside the PR comment.

