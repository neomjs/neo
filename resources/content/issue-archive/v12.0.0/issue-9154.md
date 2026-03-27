---
id: 9154
title: '[DevIndex] Add TopRepo, Twitter, and Sponsors columns'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-14T17:54:56Z'
updatedAt: '2026-02-15T16:43:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9154'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-15T16:43:51Z'
---
# [DevIndex] Add TopRepo, Twitter, and Sponsors columns

Enhance the DevIndex grid with additional columns based on the updated Contributor model.

**Requirements:**
1.  **Top Repo:** Add a column for `topRepo`.
2.  **Twitter/X:** Add an icon link column for `twitterUsername` (using the X icon).
3.  **Sponsors:** Add a boolean/icon column for `hasSponsors`.
4.  **Heuristics:** Add columns or indicators for heuristic metrics if applicable.

## Timeline

- 2026-02-14T17:54:57Z @tobiu added the `enhancement` label
- 2026-02-14T17:54:57Z @tobiu added the `ai` label
- 2026-02-14T17:55:09Z @tobiu added parent issue #9106
- 2026-02-15T02:51:08Z @tobiu assigned to @tobiu
- 2026-02-15T16:43:13Z @tobiu referenced in commit `da84797` - "feat(devindex): Add TopRepo, Twitter, and Sponsors columns to Grid (#9154)"
### @tobiu - 2026-02-15T16:43:24Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the requested column changes:
> 
> 1.  **Added Top Repo Column:** Currently displays the repo name (index 0).
> 2.  **Added Twitter (X) Column:** Uses `fa-brands fa-x-twitter` icon.
> 3.  **Added Sponsors Column:** Uses `fa-regular fa-heart` icon.
> 4.  **Reordered Columns:**
>     *   Moved `Since` before Heatmap.
>     *   Moved `Followers` before `Since`.
>     *   `Top Repo` is after `Company`.
>     *   `X` is after `Hireable`.
>     *   `Sponsors` is after `Orgs`.
> 
> **Note:** The `Top Repo` column currently only displays the name as plain text. As discussed, a future enhancement (blocked by updater changes) will turn this into a link once we have the `ghOrg/ghRepo` data structure available.
> 
> Fixed in commit: `da8479797` - feat(devindex): Add TopRepo, Twitter, and Sponsors columns to Grid (#9154)

- 2026-02-15T16:43:51Z @tobiu closed this issue

