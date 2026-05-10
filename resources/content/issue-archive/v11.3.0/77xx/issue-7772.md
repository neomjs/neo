---
id: 7772
title: Refactor SEO metadata handling in Portal ViewportController
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-14T10:51:56Z'
updatedAt: '2025-11-14T11:41:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7772'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-14T11:41:20Z'
---
# Refactor SEO metadata handling in Portal ViewportController

### Summary

The current implementation in `Portal.view.ViewportController` stores SEO metadata in a static `routeMetadata` property directly within the controller. This couples the controller tightly with static data and is not a scalable or maintainable approach.

This task proposes refactoring this logic to follow best practices by separating data, service logic, and view control.

### Proposed Architecture

1.  **Move Data to JSON File:**
    *   The static SEO metadata will be moved from `ViewportController.mjs` to a new JSON file: `apps/portal/resources/data/seo.json`.

2.  **Create a Singleton SEO Service:**
    *   A new singleton service class will be created at `apps/portal/service/Seo.mjs`.
    *   This service will extend `Neo.core.Base`.
    *   In its `initAsync()` method, it will use the native `fetch()` API to load the `seo.json` file. This simulates fetching data from a real-world API endpoint.
    *   The fetched data will be cached internally within the service.
    *   It will expose a public method, such as `getMetadata(route)`, to provide the SEO data for a given route.

3.  **Update ViewportController:**
    *   The `Portal.view.ViewportController` will be updated to use the new service.
    *   It will import the `Seo` service.
    *   The static `routeMetadata` property will be removed.
    *   The `onHashChange` method will be modified to:
        *   Ensure the `Seo` service is ready (e.g., `await Portal.service.Seo.ready()`).
        *   Call `Portal.service.Seo.getMetadata(route)` to retrieve the SEO data.
        *   Update the document head as it does now.

### Acceptance Criteria

*   The `routeMetadata` static property is removed from `Portal.view.ViewportController`.
*   A new file `apps/portal/resources/data/seo.json` exists and contains the SEO metadata.
*   A new singleton class `apps/portal/service/Seo.mjs` exists and correctly fetches and serves the SEO data.
*   `Portal.view.ViewportController` successfully uses the new service to update document head metadata on route changes.
*   The application's SEO functionality remains unchanged from a user's perspective.

## Timeline

- 2025-11-14T10:51:57Z @tobiu added the `enhancement` label
- 2025-11-14T10:51:57Z @tobiu added the `ai` label
- 2025-11-14T10:52:22Z @tobiu assigned to @tobiu
- 2025-11-14T11:41:13Z @tobiu referenced in commit `2f9dbc6` - "Refactor SEO metadata handling in Portal ViewportController #7772"
- 2025-11-14T11:41:20Z @tobiu closed this issue

