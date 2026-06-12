---
id: 7223
title: 'Create Tutorial: Building a Multi-Page App with Routing'
state: CLOSED
labels:
  - documentation
  - enhancement
  - no auto close
assignees:
  - tobiu
createdAt: '2025-09-20T12:00:30Z'
updatedAt: '2025-09-20T13:11:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7223'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-09-20T13:11:04Z'
---
# Create Tutorial: Building a Multi-Page App with Routing

### Problem
The Neo.mjs documentation includes excellent conceptual guides on the `ConfigSystem` and the `DeclarativeComponentTrees`, which explain the architecture. However, there is no practical, step-by-step tutorial that demonstrates how to apply these concepts to a common real-world problem: creating a single-page application (SPA) with multiple views and client-side routing.

### Solution
Create a new tutorial in the `learn/tutorials` section that walks the user through building a simple multi-page application. This tutorial will serve as a practical guide to implementing client-side navigation and view management.

### Tutorial Outline
The tutorial should guide the user through the following steps:

1.  **Project Setup:**
    *   Start with a basic Neo.mjs app structure.

2.  **Creating the Main Viewport:**
    *   Create a `MainViewport.mjs` that uses a `card` layout to manage different views.
    *   Assign a `reference` to the container that will hold the views.

3.  **Creating the Views:**
    *   Create two or three simple views (e.g., `HomeView.mjs`, `AboutView.mjs`, `ContactView.mjs`) that can be displayed in the card layout.

4.  **Creating the View Controller:**
    *   Create a `MainViewportController.mjs`.
    *   Define a `routes` config object that maps URL hash fragments (e.g., `#/home`, `#/about`) to controller methods.

5.  **Implementing the Route Handlers:**
    *   Write the controller methods (e.g., `onHomeRoute()`, `onAboutRoute()`) that will be triggered by hash changes.
    *   Inside these methods, use `getReference()` to get the card layout container and set its `activeIndex` to switch between the views.

6.  **Adding Navigation:**
    *   Add a simple navigation menu (e.g., a `Toolbar` with buttons) to the `MainViewport`.
    *   Configure the buttons with the `route` config to automatically change the URL hash on click.

### Acceptance Criteria
-   A new markdown file is created at `learn/tutorials/MultiPageAppRouting.md`.
-   The tutorial follows the proposed outline.
-   The tutorial provides clear, copy-pasteable code examples for each step.
-   The final result is a simple but functional multi-page application.
-   The new tutorial is added to the `learn/tree.json` file.

## Timeline

- 2025-09-20T12:00:30Z @tobiu assigned to @tobiu
- 2025-09-20T12:00:31Z @tobiu added the `documentation` label
- 2025-09-20T12:00:31Z @tobiu added the `enhancement` label
- 2025-09-20T12:00:31Z @tobiu added the `no auto close` label
- 2025-09-20T12:43:26Z @tobiu referenced in commit `355efab` - "#7223 Initial draft"
- 2025-09-20T13:09:18Z @tobiu referenced in commit `844cb94` - "#7223 Fully functional version"
- 2025-09-20T13:11:04Z @tobiu closed this issue
- 2025-09-20T13:21:28Z @tobiu referenced in commit `0fc27e0` - "#7223 cleanup"

