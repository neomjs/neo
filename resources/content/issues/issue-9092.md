---
id: 9092
title: 'Refactor: Convert DevRank to use Streaming Proxy'
state: OPEN
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-10T17:56:28Z'
updatedAt: '2026-02-10T18:08:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9092'
author: tobiu
commentsCount: 0
parentIssue: 9089
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Refactor: Convert DevRank to use Streaming Proxy

## Objective
Adopt the new Streaming Proxy in the DevRank application to demonstrate the performance gains.

## Tasks
1.  **Data Conversion:**
    -   Create a script to permanently convert `apps/devrank/resources/users.json` to `users.jsonl`.
    -   Update `apps/devrank/services/Storage.mjs` to save data as `.jsonl` (append-only is easier!).

2.  **Store Update:**
    -   Modify `apps/devrank/store/Users.mjs` (or equivalent) to use:
        ```javascript
        proxy: {
            ntype: 'stream',
            url: '../resources/users.jsonl'
        }
        ```

3.  **UI Updates:**
    -   Ensure the Grid/List handles the incremental updates smoothly (progressive rendering).

## Verification
-   Measure "Time to First Record" (should be < 50ms).
-   Verify "Time to First Render" on slow network simulation.

## Timeline

- 2026-02-10T17:56:29Z @tobiu added the `ai` label
- 2026-02-10T17:56:29Z @tobiu added the `refactoring` label
- 2026-02-10T17:58:22Z @tobiu added parent issue #9089
- 2026-02-10T18:05:35Z @tobiu cross-referenced by #9093
- 2026-02-10T18:08:51Z @tobiu assigned to @tobiu

