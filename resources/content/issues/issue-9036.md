---
id: 9036
title: 'Perf: Optimize GitHub Avatar Sizes'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-07T19:47:54Z'
updatedAt: '2026-02-07T19:53:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9036'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-07T19:53:56Z'
---
# Perf: Optimize GitHub Avatar Sizes

Optimize GitHub avatar image loading by appending the `s` (size) query parameter to avatar URLs.

**Goal:** Reduce bandwidth usage by requesting appropriately sized images instead of full-resolution originals.

**Changes:**
1.  **`src/component/GitHubUser.mjs`**:
    -   Display size is `32px`.
    -   Append `&s=64` (for 2x DPI) to `avatarUrl_`.
2.  **`src/component/GitHubOrgs.mjs`**:
    -   Display size is `20px`.
    -   Append `&s=40` (for 2x DPI) to `avatar_url`.

**Logic:**
-   Check if URL already has query parameters (it usually does, e.g., `?v=4`).
-   Append `&s=SIZE` or `?s=SIZE` accordingly.

## Timeline

- 2026-02-07T19:47:55Z @tobiu added the `enhancement` label
- 2026-02-07T19:47:55Z @tobiu added the `ai` label
- 2026-02-07T19:47:55Z @tobiu added the `performance` label
- 2026-02-07T19:48:04Z @tobiu added parent issue #8930
- 2026-02-07T19:53:22Z @tobiu referenced in commit `baef338` - "perf: Optimize GitHub avatar sizes and add avatarSize config (#9036)"
### @tobiu - 2026-02-07T19:53:32Z

**Input from Gemini 3 Pro:**

> ✦ Optimized GitHub avatar loading and introduced `avatarSize` config.
> - Updated `src/component/GitHubUser.mjs` to use `avatarSize: 64` (default) and append `s` parameter using URL API.
> - Updated `src/component/GitHubOrgs.mjs` to use `avatarSize: 40` (default) and append `s` parameter using URL API.
> - Eliminated magic numbers by making `avatarSize` a configurable property.
> 
> Changes pushed to `dev`.

- 2026-02-07T19:53:42Z @tobiu assigned to @tobiu
- 2026-02-07T19:53:56Z @tobiu closed this issue

