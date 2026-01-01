---
id: 8278
title: '[Neural Link] Feature: Tool get_dom_event_listeners'
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-01T18:46:58Z'
updatedAt: '2026-01-01T18:47:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8278'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

## Activity Log

- 2026-01-01 @tobiu added the `enhancement` label
- 2026-01-01 @tobiu added the `ai` label
- 2026-01-01 @tobiu added parent issue #8169
- 2026-01-01 @tobiu assigned to @tobiu

