---
id: 8278
title: '[Neural Link] Feature: Tool get_dom_event_listeners'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-01T18:46:58Z'
updatedAt: '2026-01-02T09:42:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8278'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-02T09:42:45Z'
---
# [Neural Link] Feature: Tool get_dom_event_listeners

Create a new Neural Link tool `get_dom_event_listeners` to inspect detailed DOM listeners for a specific component.

**Why:**
To debug event delegation and interaction logic on a specific component.

**Requirements:**
1.  **Client-Side:** Implement `getDomEventListeners({ componentId })` in `RuntimeService`.
    -   Must validate `componentId`.
    -   Return array of sanitized listener objects (event, delegate, priority, handler name).
2.  **Server-Side:** Define `get_dom_event_listeners` tool in MCP.
3.  **Schema:** Strict array response.

## Timeline

- 2026-01-01T18:46:59Z @tobiu added the `enhancement` label
- 2026-01-01T18:46:59Z @tobiu added the `ai` label
- 2026-01-01T18:47:11Z @tobiu added parent issue #8169
- 2026-01-01T18:47:54Z @tobiu assigned to @tobiu
- 2026-01-02T09:42:45Z @tobiu closed this issue

