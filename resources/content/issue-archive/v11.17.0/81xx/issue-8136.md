---
id: 8136
title: 'Create guide: Worker Architecture & Messaging'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-17T02:57:33Z'
updatedAt: '2025-12-17T04:31:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8136'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-17T04:31:48Z'
---
# Create guide: Worker Architecture & Messaging

Create a new comprehensive guide `learn/guides/fundamentals/WorkerArchitecture.md` that explains the multi-threaded architecture of Neo.mjs.

**Scope:**
1.  **Worker Model:** Explain the distinct roles of App, VDom, Data, and Main threads.
2.  **Message Routing:** Detail how `Neo.worker.Manager` and `Neo.worker.Base` orchestrate communication.
3.  **Communication Patterns:**
    *   **Standard (RPC):** App -> Main -> App (e.g., Addons).
    *   **Triangular (VDOM):** App -> VDom -> Main -> App (Optimization for DOM updates).
    *   **Direct (MessageChannel):** App <-> Canvas (Peer-to-peer optimization).
4.  **Remote Method Access (RMA):** Explain the "magic" behind the proxy methods, promises, and error handling across threads.
5.  **Use Cases:** Provide examples of when each pattern is used and why.

**Update `learn/tree.json`:**
Add the new guide entry to the `guides/fundamentals` section.

## Timeline

- 2025-12-17T02:57:34Z @tobiu added the `documentation` label
- 2025-12-17T02:57:34Z @tobiu added the `enhancement` label
- 2025-12-17T02:57:35Z @tobiu added the `ai` label
- 2025-12-17T02:57:47Z @tobiu assigned to @tobiu
- 2025-12-17T04:29:28Z @tobiu referenced in commit `3c43954` - "Create guide: Worker Architecture & Messaging (#8136)"
- 2025-12-17T04:31:48Z @tobiu closed this issue

