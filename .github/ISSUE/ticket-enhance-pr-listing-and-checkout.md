---
title: Enhance PR Listing and Checkout Logic
labels: enhancement, AI
---

GH ticket id: #7382

**Epic:** #7477
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

This ticket covers two improvements to the `pullRequestService`:

1.  **Filter by State:** The `listPullRequests` function has been enhanced to allow filtering pull requests by their state (`open`, `closed`, `merged`, `all`). This is exposed via a `state` query parameter in the `GET /pull-requests` endpoint.

2.  **Improved Checkout Response:** The `checkoutPullRequest` function was updated to include the `stdout` from the `gh pr checkout` command in its response. This provides more useful feedback to the caller (e.g., the name of the branch that was checked out).

## Acceptance Criteria

1.  The `openapi.yaml` is updated to include the optional `state` query parameter for the `GET /pull-requests` endpoint.
2.  `pullRequestService.mjs` is updated:
    - `listPullRequests` now accepts a `state` option and passes it to the `gh pr list --state` command.
    - `checkoutPullRequest` now returns an object containing the `details` from the command's `stdout`.
3.  The `pullRequests.mjs` route is updated to read the `state` from the query string and pass it to the service.
