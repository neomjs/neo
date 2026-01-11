---
id: 7242
title: Refine AI Query Scoring for Release Notes
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-23T14:37:39Z'
updatedAt: '2025-09-23T14:38:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7242'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-09-23T14:38:59Z'
---
# Refine AI Query Scoring for Release Notes

Following the integration of release notes into the knowledge base, it has become apparent that the query scoring algorithm needs refinement to handle this new content type appropriately.

This ticket covers two key adjustments to the scoring logic in `buildScripts/ai/queryKnowledgeBase.mjs`.

## Scope of Work

1.  **Improve Version Number Matching:**
    -   When a query appears to be a version number (e.g., "v10.8.0"), the scoring algorithm should give a very high boost to the release note file that has an exact or very close match in its filename.
    -   This will ensure that searching for a specific version reliably returns the correct release notes as the top result.

2.  **Adjust Global Priority for Release Notes:**
    -   When a query is performed *without* a specific type filter (i.e., `type: 'all'`), chunks with the type `release` should be given a lower base score or a negative modifier.
    -   This is to prevent release notes from cluttering the results of common technical or conceptual queries, where `src`, `guide`, or `example` files are almost always more relevant.
    -   The goal is to make release notes highly accessible when explicitly searched for, but unobtrusive during general-purpose queries.

## Acceptance Criteria

-   Running `npm run ai:query -- -q "v10.8.0" -t release` returns `/Users/Shared/github/neomjs/neo/.github/RELEASE_NOTES/v10.8.0.md` as the top result.
-   Running a general query like `npm run ai:query -- -q "reactivity"` does not show release notes in the top results, prioritizing `src` and `guide` files.
-   The new scoring logic is well-documented within the `queryKnowledgeBase.mjs` script.

## Timeline

- 2025-09-23T14:37:39Z @tobiu assigned to @tobiu
- 2025-09-23T14:37:41Z @tobiu added the `enhancement` label
- 2025-09-23T14:38:43Z @tobiu referenced in commit `2243864` - "Refine AI Query Scoring for Release Notes #7242"
### @tobiu - 2025-09-23T14:38:59Z

<img width="904" height="1279" alt="Image" src="https://github.com/user-attachments/assets/7d9895b7-2cf5-401d-916a-e12e397731a3" />

- 2025-09-23T14:38:59Z @tobiu closed this issue

