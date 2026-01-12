---
id: 8540
title: Implement Store-Driven VDOM Ticket Component (V2)
state: OPEN
labels:
  - enhancement
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-01-11T10:17:30Z'
updatedAt: '2026-01-11T10:17:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8540'
author: tobiu
commentsCount: 0
parentIssue: 8537
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Implement Store-Driven VDOM Ticket Component (V2)

Create `Portal.view.ticket.v2.Component` that renders directly from a `Portal.store.Ticket` and `Portal.store.TicketTimeline`.

**Requirements:**
- **No `marked.parse` for structure:** Map JSON timeline events directly to VDOM nodes.
- **Store Binding:** The view must react to `store.add()` events by appending VNodes (delta updates), not re-rendering the whole list.
- **Zero Layout Thrashing:** Ensure initial render and subsequent updates are VDOM-native.


## Timeline

- 2026-01-11T10:17:31Z @tobiu added the `enhancement` label
- 2026-01-11T10:17:31Z @tobiu added the `performance` label
- 2026-01-11T10:17:32Z @tobiu added the `core` label
- 2026-01-11T10:17:51Z @tobiu assigned to @tobiu
- 2026-01-11T10:18:00Z @tobiu added parent issue #8537

