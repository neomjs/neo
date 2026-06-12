---
id: 9088
title: 'Fix: DevRank Spider Premature Exit (Split Core/Search Rate Limits)'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-10T16:48:24Z'
updatedAt: '2026-02-10T17:05:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9088'
author: tobiu
commentsCount: 2
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-10T17:00:13Z'
---
# Fix: DevRank Spider Premature Exit (Split Core/Search Rate Limits)

## Problem
The `DevRank.services.Spider` incorrectly triggers a "Graceful Exit" (stopping all operations) when the GitHub API Search Rate Limit (30 req/min) is reached, even if the Core Rate Limit (5000 req/hr) is still healthy.

This happens because `GitHub.mjs` currently tracks a single `rateLimit` object, which gets overwritten by the headers of the last request.
1. Spider runs a search query -> `rateLimit` updated to ~29/30.
2. Spider tries to process repositories (fetching contributors via Core API).
3. Spider sees `rateLimit.remaining` is 29 (from Search) and incorrectly thinks it's below the safety threshold (50), triggering a shutdown.

## Goal
Decouple rate limit tracking to respect GitHub's `x-ratelimit-resource` header.

## Proposed Changes
1.  **Refactor `GitHub.mjs`:**
    - Change `rateLimit` config to store multiple buckets:
      ```javascript
      rateLimit: {
          core: { remaining: 5000, reset: null, limit: 5000 },
          search: { remaining: 30, reset: null, limit: 30 },
          graphql: { remaining: 5000, reset: null, limit: 5000 },
          integration_manifest: { remaining: 5000, reset: null, limit: 5000 }
      }
      ```
    - Update `#updateRateLimit` to read `x-ratelimit-resource` and update the corresponding bucket.

2.  **Update `Spider.mjs`:**
    - Use `GitHub.rateLimit.search` for `runSearch`.
    - Use `GitHub.rateLimit.core` for `fetchContributors` / `processRepositories`.

3.  **Update `Updater.mjs`:**
    - Ensure it uses the correct bucket (likely `graphql` or `core`).

## Acceptance Criteria
- Spider continues processing repositories (Core API) even if Search API limit is exhausted.
- Spider pauses *only* searching when Search limit is low.
- Logs clearly distinguish between Core and Search limits.


## Timeline

- 2026-02-10T16:48:25Z @tobiu added the `bug` label
- 2026-02-10T16:48:26Z @tobiu added the `ai` label
- 2026-02-10T16:51:03Z @tobiu added parent issue #8930
- 2026-02-10T16:56:34Z @tobiu referenced in commit `fd96130` - "fix: Split rate limits to prevent premature exit (#9088)"
### @tobiu - 2026-02-10T16:57:32Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the rate limit splitting and verified it works.
> 
> **Changes:**
> 1.  **Rate Limit Buckets:** `GitHub.mjs` now tracks `core`, `search`, `graphql`, and `integration_manifest` limits separately.
> 2.  **Smart Parsing:** The `x-ratelimit-resource` header is parsed to update the correct bucket.
> 3.  **Targeted Checks:**
>     - `Spider.mjs`: `runSearch` checks `search` bucket. `processRepositories` checks `core` bucket.
>     - `Updater.mjs`: Explicitly checks `core` bucket (as GraphQL generally consumes this quota or has its own high limit).
> 4.  **Logging:** Logs now clearly indicate which bucket is critical (e.g. `RATE LIMIT CRITICAL (core)`).
> 
> **Result:**
> The Spider successfully processed ~260 candidates before hitting the **Core** rate limit (403 Forbidden on `raspberrypi/linux`), correctly triggering the shutdown for the *Core* bucket. It did *not* exit prematurely due to the Search limit. The fix is effective.

### @tobiu - 2026-02-10T16:57:45Z

**Input from Gemini 3 Pro:**

> ✦ I will close this ticket now as the fix is verified.

- 2026-02-10T17:00:13Z @tobiu closed this issue
- 2026-02-10T17:05:21Z @tobiu assigned to @tobiu

