---
id: 7773
title: Enhance Router to provide `capturedRoute` in handler parameters
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-14T14:25:09Z'
updatedAt: '2025-11-14T15:01:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7773'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-14T15:01:57Z'
---
# Enhance Router to provide `capturedRoute` in handler parameters

The `onHashChange` method in `src/controller/Base.mjs` should be enhanced to provide more context to route handlers (`handler`, `preHandler`, `defaultRoute`).

Currently, handlers receive `(params, value, oldValue)`. The `value` object, which comes from `HashHistory`, contains information about the hash change. This `value` object should be enhanced to include a `capturedRoute` property, which would be the string of the route pattern that was matched.

**Acceptance Criteria:**

1.  When a specific route is matched, the `value` object passed to its `preHandler` (if any) and `handler` should contain a `capturedRoute` property with the matching route key (e.g., `/users/{userId}`).
2.  When no specific route is matched and a `defaultRoute` is configured, the `value` object passed to the default handler should contain `capturedRoute: 'default'`.
3.  When no route is matched and no `defaultRoute` is configured, the `value` object passed to `onNoRouteFound` should contain `capturedRoute: null`.

This will allow handlers to have more context about which route pattern triggered them, which can be useful for analytics, logging, or dynamic behavior.

## Timeline

- 2025-11-14T14:25:09Z @tobiu added the `enhancement` label
- 2025-11-14T14:25:10Z @tobiu added the `ai` label
- 2025-11-14T14:27:55Z @tobiu assigned to @tobiu
- 2025-11-14T15:01:31Z @tobiu referenced in commit `a1d3f9c` - "Enhance Router to provide capturedRoute in handler parameters #7773"
- 2025-11-14T15:01:57Z @tobiu closed this issue

