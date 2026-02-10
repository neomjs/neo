---
id: 9087
title: 'Fix: Broken GitHub Rate Limit Detection and Graceful Exit'
state: CLOSED
labels:
  - ai
  - feature
assignees:
  - tobiu
createdAt: '2026-02-10T15:54:14Z'
updatedAt: '2026-02-10T16:41:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9087'
author: tobiu
commentsCount: 2
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-10T16:22:02Z'
---
# Fix: Broken GitHub Rate Limit Detection and Graceful Exit

## Problem
The rate limit detection implemented in #9083 is non-functional.
1. `API Quota` logs consistently show `5000/5000` (max) even when the limit is consumed.
2. The `Updater` service fails to exit when the limit is reached, causing cascading `API rate limit already exceeded` errors.

## Root Cause Analysis
- The `GitHub` service relies solely on `x-rate-limit-*` headers.
- Logs indicate these headers are either missing, null, or not being parsed correctly in the current environment (likely due to fetch implementation differences or API quirks).
- Since `rateLimit.remaining` never updates, the "Graceful Exit" check (`remaining < 50`) in `Updater.mjs` never triggers.
- Additionally, `Updater.mjs` swallows rate limit errors in the `processUser` catch block, allowing the loop to continue hammering the API.

## Proposed Solution
1.  **Robust Detection (GraphQL Body):**
    - Modify `Updater.mjs` to request `rateLimit { remaining limit resetAt }` in all GraphQL queries.
    - Update `GitHub.mjs` to inspect `json.data.rateLimit` and update the internal state from the response body (primary source of truth for GraphQL).

2.  **Robust Detection (Headers):**
    - Add logging to `GitHub.mjs` to debug why header parsing is failing (e.g., casing issues).

3.  **Fail-Safe Kill Switch:**
    - Update `Updater.mjs` to detect "rate limit exceeded" errors in the catch block.
    - If detected, force `GitHub.rateLimit.remaining = 0` and abort the batch immediately.

## Tasks
- [ ] Modify `apps/devrank/services/GitHub.mjs` to parse `data.rateLimit`.
- [ ] Modify `apps/devrank/services/Updater.mjs` to include `rateLimit` field in queries.
- [ ] Add kill-switch logic to `Updater.mjs`.

## Timeline

- 2026-02-10T15:54:14Z @tobiu assigned to @tobiu
- 2026-02-10T15:54:15Z @tobiu added parent issue #8930
- 2026-02-10T15:54:33Z @tobiu added the `ai` label
- 2026-02-10T15:54:33Z @tobiu added the `feature` label
- 2026-02-10T16:06:51Z @tobiu referenced in commit `5277cb0` - "feat: Robust GitHub API rate limit detection and graceful exit (#9087)"
### @tobiu - 2026-02-10T16:21:28Z

I have implemented the robust rate limit fix.

**Changes:**
1.  **GraphQL Body Parsing:** `GitHub.mjs` now parses the `rateLimit` object from the GraphQL response body.
2.  **Explicit Querying:** `Updater.mjs` now requests `rateLimit { remaining limit resetAt }` in all queries.
3.  **Kill-Switch:** `Updater.mjs` and `Spider.mjs` now catch rate limit errors and force a graceful shutdown.
4.  **REST Protection:** `GitHub.mjs` now sets remaining to 0 on any 403 REST response.

This ensures the system correctly detects when the limit is hit and exits gracefully, preventing data loss or API bans.

- 2026-02-10T16:22:02Z @tobiu closed this issue
- 2026-02-10T16:40:51Z @tobiu referenced in commit `1969208` - "fix: Robust rate limit header parsing and recovery logs (#9087)"
### @tobiu - 2026-02-10T16:41:02Z

**Input from Gemini 3 Pro:**

> ✦ I have pushed a follow-up fix to resolve the rate limit log noise and ensure accurate header parsing.
> 
> **Changes:**
> 1.  **Header Fix:** `GitHub.mjs` now correctly parses standard `x-ratelimit-*` headers (GitHub sometimes omits the dash in `rate-limit`). This eliminates the false "headers not found" warnings.
> 2.  **Recovery Time:** `Spider.mjs` now logs the estimated recovery time (in minutes) when the critical limit is hit, improving observability.
> 
> The system now correctly identifies the rate limit state and provides actionable feedback.


