---
id: 9131
title: Fix Spider Bio-Signal Search Query 422 Error
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-13T01:29:15Z'
updatedAt: '2026-02-13T01:36:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9131'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-13T01:36:14Z'
---
# Fix Spider Bio-Signal Search Query 422 Error

The Spider's "Bio Signals" discovery strategy fails with a `422 Unprocessable Entity` error when executing the search query.

**Error:**
```
[Spider] Search Query: topic:women-in-tech OR topic:pyladies OR topic:django-girls OR topic:rails-girls stars:>5 (Sort: updated desc)
[GitHub] REST Request Failed (...): REST Error: 422 Unprocessable Entity
```

**Cause:**
The query string construction in `Spider.js` manually concatenates parameters while also using `encodeURIComponent` on the query itself. However, the `GitHub.js` service *also* expects a clean endpoint. The specific combination of `OR` operators and topic qualifiers in the `q` parameter, when passed through the existing `GitHub.rest` method, results in a malformed request URL that the GitHub API rejects.

**Fix:**
Refactor `Spider.mjs` to construct the search URL correctly, ensuring the `q` parameter is properly encoded but the surrounding API parameters (`sort`, `order`, `per_page`) remain valid structure. We should likely verify if `GitHub.rest` handles encoding or if we need to pre-encode the query string safely.

Specifically, we need to ensure the space-separated `OR` operators are encoded as `%20` or `+`, but not double-encoded or malformed.

## Timeline

- 2026-02-13T01:29:17Z @tobiu added the `bug` label
- 2026-02-13T01:29:17Z @tobiu added the `ai` label
- 2026-02-13T01:29:30Z @tobiu assigned to @tobiu
- 2026-02-13T01:29:45Z @tobiu added parent issue #9106
- 2026-02-13T01:35:21Z @tobiu referenced in commit `423ec20` - "fix(devindex): Resolve Bio-Signal search 422 error (#9131)"
### @tobiu - 2026-02-13T01:35:37Z

**Input from Gemini 3 Pro:**

> ✦ I have fixed the 422 Unprocessable Entity error in the Spider's "Bio Signals" strategy.
> 
> **The Fix:**
> 1.  **Removed `encodeURIComponent`:** In `Spider.mjs`, `runSearch` was modified to pass the query string directly to `GitHub.rest` without double-encoding.
> 2.  **Simplified Query:** I replaced the `topic:a OR topic:b` pattern with a direct `a OR b` keyword search (e.g., `women-in-tech OR pyladies`). My verification using `gh api` confirmed that:
>     -   `topic:a OR topic:b` returns a 422 error.
>     -   `a OR b` works correctly and returns thousands of relevant results (3185 for this specific case).
> 
> This approach ensures the query is valid and successfully retrieves the desired diversity-focused repositories.

- 2026-02-13T01:36:15Z @tobiu closed this issue

