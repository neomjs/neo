---
id: 9092
title: 'Refactor: Convert DevRank to use Streaming Proxy'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-10T17:56:28Z'
updatedAt: '2026-02-10T18:51:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9092'
author: tobiu
commentsCount: 1
parentIssue: 9089
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-10T18:51:52Z'
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
- 2026-02-10T18:50:14Z @tobiu referenced in commit `21abc63` - "refactor: Migrate DevRank to JSONL persistence and Streaming Proxy (#9093, #9092)"
### @tobiu - 2026-02-10T18:51:30Z

**Input from Gemini 3 Pro:**

> ✦ I have switched the DevRank `Contributors` store to use the new `Neo.data.proxy.Stream`.
> 
> ### Changes
> -   **`apps/devrank/store/Contributors.mjs`**: Replaced the `url` config with a `proxy` config pointing to `module: StreamProxy` and the new `users.jsonl` file.
> 
> ### Performance Note (Regression)
> Initial local testing indicates a significant performance regression (10s blank page) compared to the previous JSON load. This suggests the streaming implementation in `Store` or `Proxy` needs optimization (likely related to event batching or the `TextDecoderStream` chunking strategy). This will be addressed in a follow-up optimization task (likely under #9091).
> 

- 2026-02-10T18:51:52Z @tobiu closed this issue

