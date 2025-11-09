---
id: 7547
title: Enhance DatabaseLifecycleService with Eventing
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-18T14:42:39Z'
updatedAt: '2025-10-18T14:53:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7547'
author: tobiu
commentsCount: 0
parentIssue: 7536
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-18T14:53:00Z'
---
# Enhance DatabaseLifecycleService with Eventing

**Reported by:** @tobiu on 2025-10-18

---

**Parent Issue:** #7536 - Epic: Integrate Neo.mjs Core into MCP Servers

---

To provide clear and decoupled notifications about the ChromaDB process management status, this ticket focuses on enhancing the `DatabaseLifecycleService` singleton with eventing capabilities. This is particularly important given the hybrid strategy where ChromaDB can be managed internally by the service or run externally.

## Acceptance Criteria

1.  The `DatabaseLifecycleService` class mixes in `Neo.core.Observable` by setting `static observable = true`.
2.  The `startDatabase` method is updated to fire a single `'processActive'` event when it successfully spawns a new process or detects an externally managed process.
    *   This event will include `pid` (if available), `managedByService: true` (for internally spawned) or `managedByService: false` (for externally detected), and a `detail` string.
3.  The `stopDatabase` method is updated to fire a `'processStopped'` event (with the PID and `managedByService: true`) when it successfully terminates a managed process.
4.  The `mcp-stdio.mjs` entry point (or a relevant service) is updated to subscribe to these events for logging purposes, demonstrating the eventing mechanism.
5.  All related functionalities continue to work correctly after the changes.

