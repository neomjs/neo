---
id: 8279
title: '[Neural Link] Feature: Tool get_dom_event_summary'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-01T18:47:01Z'
updatedAt: '2026-01-02T09:42:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8279'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-02T09:42:46Z'
---
# [Neural Link] Feature: Tool get_dom_event_summary

Create a new Neural Link tool `get_dom_event_summary` to provide a high-level overview of the `DomEvent` manager state.

**Why:**
To understand the global event landscape and identify potential hotspots (e.g., too many global listeners).

**Requirements:**
1.  **Client-Side:** Implement `getDomEventSummary()` in `RuntimeService`.
    -   Iterate `manager.DomEvent.items`.
    -   Calculate totals and counts per event type.
2.  **Server-Side:** Define `get_dom_event_summary` tool in MCP.
3.  **Schema:** Strict summary object response (total, byEvent map).

## Timeline

- 2026-01-01T18:47:03Z @tobiu added the `enhancement` label
- 2026-01-01T18:47:03Z @tobiu added the `ai` label
- 2026-01-01T18:47:14Z @tobiu added parent issue #8169
- 2026-01-01T18:48:01Z @tobiu assigned to @tobiu
- 2026-01-02T09:42:46Z @tobiu closed this issue
- 2026-01-04T03:10:29Z @jonnyamsp referenced in commit `e8372da` - "feat(ai): Implement DOM Event introspection tools (#8278, #8279)

- Implement client-side logic for getDomEventListeners and getDomEventSummary in RuntimeService
- Update Client.mjs to route get_dom_event requests
- Update Server-side RuntimeService to expose new methods
- Update OpenAPI definition with new tools

Closes #8278
Closes #8279"

