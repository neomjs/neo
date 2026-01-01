---
id: 8279
title: '[Neural Link] Feature: Tool get_dom_event_summary'
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-01T18:47:01Z'
updatedAt: '2026-01-01T18:48:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8279'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

## Activity Log

- 2026-01-01 @tobiu added the `enhancement` label
- 2026-01-01 @tobiu added the `ai` label
- 2026-01-01 @tobiu added parent issue #8169
- 2026-01-01 @tobiu assigned to @tobiu

