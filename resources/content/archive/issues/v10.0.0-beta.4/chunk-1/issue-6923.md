---
id: 6923
title: Enhanced Routing with Nested Path Support and Specificity Prioritization
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-01T14:07:49Z'
updatedAt: '2025-07-01T15:06:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6923'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-01T15:06:54Z'
---
# Enhanced Routing with Nested Path Support and Specificity Prioritization

### Is your feature request related to a problem? Please describe.
The existing routing mechanism in `Neo.controller.Base` had limitations in handling nested URL paths and resolving conflicts between overlapping routes. Specifically:
1.  The `{*paramName}` wildcard in route definitions did not correctly capture path segments containing slashes, leading to `itemId` parameters being `undefined` for nested routes (e.g., `/learn/gettingstarted/Workspaces`).
2.  The route matching logic in `onHashChange` followed a "first match wins" approach, which caused less specific routes (e.g., `/learn`) to be prioritized over more specific ones (e.g., `/learn/{*itemId}`), even when a more detailed match was available.

### Describe the solution you'd like
The routing system has been enhanced to provide more robust and intuitive behavior for complex URL structures. The key improvements are:
1.  **Correct Wildcard Parsing:** The `{*paramName}` and `{...paramName}` syntaxes now correctly capture entire nested path segments, including slashes, making them suitable for hierarchical content navigation.
2.  **Specificity-Based Route Matching:** The `onHashChange` method now intelligently selects the *most specific* matching route. This prioritization is based on:
    *   The length of the matched URL segment (longer matches are preferred).
    *   The number of slashes in the route pattern (more slashes indicate deeper nesting and higher specificity).
3.  **Improved Documentation:** The `src/controller/Base.mjs` file has been updated with intent-driven comments and examples to clearly explain the enhanced routing capabilities and their usage.

### Describe alternatives you've considered
Manually parsing the URL hash within individual route handlers was a cumbersome alternative, but it lacked the declarative and robust nature of a framework-level routing solution.

### Additional context
These changes significantly improve the flexibility and predictability of routing within Neo.mjs applications, particularly for applications with deep navigation structures like documentation or content management systems. For example, a route like `'/learn/{*itemId}': 'onRouteLearnItem'` can now effectively handle nested paths.

**Modified Files:**
*   `src/controller/Base.mjs`: Core routing logic and documentation updates.
*   `apps/portal/view/learn/MainContainerController.mjs`: `'/learn/{*itemId}'`
*   `apps/portal/view/learn/ViewportController.mjs`: `'/learn/{*itemId}'`

## Timeline

- 2025-07-01T14:07:49Z @tobiu assigned to @tobiu
- 2025-07-01T14:07:50Z @tobiu added the `enhancement` label
- 2025-07-01T14:08:23Z @tobiu referenced in commit `bce0772` - "Enhanced Routing with Nested Path Support and Specificity Prioritization #6923"
- 2025-07-01T14:41:37Z @tobiu referenced in commit `addd7ae` - "#6923 code cleanup"
- 2025-07-01T15:06:54Z @tobiu closed this issue

