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
  - '[x] 8170'
  - '[x] 8171'
  - '[x] 8172'
  - '[x] 8016'
  - '[x] 8173'
  - '[x] 8174'
  - '[x] 8175'
  - '[x] 8176'
  - '[x] 8177'
  - '[x] 8178'
  - '[x] 8179'
  - '[x] 8180'
  - '[x] 8181'
  - '[x] 8183'
  - '[x] 8184'
  - '[x] 8185'
  - '[x] 8186'
  - '[x] 8187'
  - '[x] 8188'
  - '[ ] 8189'
  - '[ ] 8190'
  - '[ ] 8191'
  - '[ ] 8192'
  - '[ ] 8193'
  - '[x] 8182'
  - '[x] 8194'
  - '[x] 8195'
  - '[x] 8196'
  - '[ ] 8197'
  - '[x] 8206'
  - '[x] 8207'
  - '[x] 8208'
subIssuesCompleted: 26
subIssuesTotal: 32
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
- 2025-12-28 @tobiu added sub-issue #8174
- 2025-12-28 @tobiu added sub-issue #8175
- 2025-12-28 @tobiu added sub-issue #8176
- 2025-12-28 @tobiu added sub-issue #8177
- 2025-12-28 @tobiu referenced in commit `21b8247` - "feat(ai): Implement Neural Link healing and standardize routing (#8169)

- Refactor API: Rename windowId to sessionId for clarity (#8174)
- Feat: Implement window connect/disconnect notifications (#8175)
- Feat: Add state rehydration on reconnect (#8176)
- Update Client to track lifecycle and sync topology
- Update ConnectionService to cache window state and serve topology instantly"
- 2025-12-28 @tobiu added sub-issue #8178
- 2025-12-28 @tobiu added sub-issue #8179
- 2025-12-28 @tobiu added sub-issue #8180
- 2025-12-28 @tobiu added sub-issue #8181
- 2025-12-28 @tobiu added sub-issue #8183
- 2025-12-28 @tobiu added sub-issue #8184
- 2025-12-28 @tobiu added sub-issue #8185
- 2025-12-28 @tobiu added sub-issue #8186
- 2025-12-28 @tobiu added sub-issue #8187
- 2025-12-28 @tobiu added sub-issue #8188
- 2025-12-28 @tobiu added sub-issue #8189
- 2025-12-28 @tobiu added sub-issue #8190
- 2025-12-28 @tobiu added sub-issue #8191
- 2025-12-28 @tobiu added sub-issue #8192
- 2025-12-28 @tobiu added sub-issue #8193
- 2025-12-28 @tobiu added sub-issue #8182
- 2025-12-28 @tobiu added sub-issue #8194
- 2025-12-28 @tobiu added sub-issue #8195
- 2025-12-28 @tobiu added sub-issue #8196
- 2025-12-29 @tobiu added sub-issue #8197
- 2025-12-29 @tobiu added sub-issue #8206
- 2025-12-29 @tobiu added sub-issue #8207
- 2025-12-30 @tobiu added sub-issue #8208

