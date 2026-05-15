---
id: 7482
title: Enhance PR Listing and Checkout Logic
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-14T09:37:16Z'
updatedAt: '2025-10-14T09:37:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7482'
author: tobiu
commentsCount: 0
parentIssue: 7477
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-14T09:37:52Z'
---
# Enhance PR Listing and Checkout Logic

This ticket covers two improvements to the `pullRequestService`:

1.  **Filter by State:** The `listPullRequests` function has been enhanced to allow filtering pull requests by their state (`open`, `closed`, `merged`, `all`). This is exposed via a `state` query parameter in the `GET /pull-requests` endpoint.

2.  **Improved Checkout Response:** The `checkoutPullRequest` function was updated to include the `stdout` from the `gh pr checkout` command in its response. This provides more useful feedback to the caller (e.g., the name of the branch that was checked out).

## Acceptance Criteria

1.  The `openapi.yaml` is updated to include the optional `state` query parameter for the `GET /pull-requests` endpoint.
2.  `pullRequestService.mjs` is updated:
    - `listPullRequests` now accepts a `state` option and passes it to the `gh pr list --state` command.
    - `checkoutPullRequest` now returns an object containing the `details` from the command's `stdout`.
3.  The `pullRequests.mjs` route is updated to read the `state` from the query string and pass it to the service.

## Timeline

- 2025-10-14T09:37:17Z @tobiu assigned to @tobiu
- 2025-10-14T09:37:18Z @tobiu added the `enhancement` label
- 2025-10-14T09:37:18Z @tobiu added parent issue #7477
- 2025-10-14T09:37:18Z @tobiu added the `ai` label
- 2025-10-14T09:37:46Z @tobiu referenced in commit `b5ef261` - "Enhance PR Listing and Checkout Logic #7482"
- 2025-10-14T09:37:52Z @tobiu closed this issue

