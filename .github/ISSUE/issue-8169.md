---
id: 8169
title: Neural Link Core Capabilities
state: OPEN
labels:
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-28T13:36:46Z'
updatedAt: '2025-12-28T13:36:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8169'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - 8170
  - 8171
  - 8172
  - 8016
  - 8173
subIssuesCompleted: 1
subIssuesTotal: 5
blockedBy: []
blocking: []
---
# Neural Link Core Capabilities

This epic tracks the implementation of core capabilities for the **Neural Link**, enabling AI agents to inspect and modify the running Neo.mjs application state via the `neo-neural-link` MCP server.

**Goal:**
Empower AI agents to "see" and "touch" the runtime application, moving beyond static code analysis. This is a prerequisite for advanced features like "Infinite Canvas" debugging, "Self-Healing Apps," and "Runtime Orchestration."

**Scope:**
1.  **Read/Write Primitives:** Implement the ability to retrieve component/vdom/vnode trees and get/set properties via `Neo.ai.Client`.
2.  **Runtime Inspection Tools:** Create specialized MCP tools to inspect complex internal subsystems (Drag & Drop, Focus, etc.).
3.  **Topology Discovery:** Enable agents to map `windowId`s to logical application parts (Main Window, Popups) with rich metadata.

**Success Criteria:**
-   An AI agent can query the current component tree (with configurable depth and serialization safety).
-   An AI agent can read and write properties/configs of a live component.
-   An AI agent can inspect the state of a drag operation in real-time.


## Activity Log

- 2025-12-28 @tobiu added the `epic` label
- 2025-12-28 @tobiu added the `ai` label
- 2025-12-28 @tobiu added the `architecture` label
- 2025-12-28 @tobiu assigned to @tobiu
- 2025-12-28 @tobiu added sub-issue #8170
- 2025-12-28 @tobiu added sub-issue #8171
- 2025-12-28 @tobiu added sub-issue #8172
- 2025-12-28 @tobiu added sub-issue #8016
- 2025-12-28 @tobiu added sub-issue #8173

