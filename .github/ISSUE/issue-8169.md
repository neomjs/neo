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
  - '[x] 8170 Implement Neural Link Client Core (Tree & Props)'
  - '[x] 8171 Implement Neural Link Window Topology Discovery'
  - '[x] 8172 Implement Neural Link Drag & Drop Inspection'
  - '[x] 8016 Harden Neural Link MCP Server'
  - '[x] 8173 Implement Unique App Worker Identification & Worker Topology'
  - '[x] 8174 Refactor Neural Link Routing: Standardize Session vs Window ID'
  - '[x] 8175 Implement Window Connect/Disconnect Notifications for Neural Link'
  - '[x] 8176 Implement Neural Link State Rehydration on Reconnect'
  - '[x] 8177 Harden WebSocket Connection: Backoff & Auto-Reconnect'
  - '[x] 8178 Refactor: Extract ComponentService from ConnectionService'
  - '[x] 8179 Refactor: Extract RuntimeService from ConnectionService'
  - '[x] 8180 Refactor: Extract InteractionService from ConnectionService'
  - '[x] 8181 Feat: ConnectionService Lifecycle Tools'
  - '[x] 8183 Feat: Neural Link - Data Store Inspection & Manager'
  - '[x] 8184 Feat: Neural Link - Navigation Control & History'
  - '[x] 8185 Feat: Neural Link - Visual Inspection (DomRect)'
  - '[x] 8186 Feat: Neural Link - Semantic Component Query'
  - '[x] 8187 Feat: Neural Link - State Provider Inspection & Modification'
  - '[x] 8188 Feat: Neural Link - Visual Highlighting'
  - '[x] 8189 Feat: Neural Link - Advanced Event Simulation'
  - '[x] 8190 Feat: Neural Link - Runtime Code Hot-Patching'
  - '[x] 8191 Feat: Neural Link - Global Config Management'
  - '[x] 8192 Feat: Neural Link - Log & Error Streaming'
  - '[x] 8193 Feat: Neural Link - Namespace Discovery'
  - '[x] 8182 Feat: Neural Link Identity and Recovery'
  - '[x] 8194 Feat: Neural Link - Propagate Runtime Errors to Agent'
  - '[x] 8195 Feat: Neural Link - Get Record Tool'
  - '[x] 8196 Refactor: Neural Link - Client-Side Service Architecture'
  - '[ ] 8197 Feat: Neural Link - Export Domain Services in AI SDK'
  - '[x] 8206 Refactor Client Services to use Parameter Destructuring'
  - '[x] 8207 ai.Client: Enhance handleRequest to support sync and async execution'
  - '[x] 8208 ai.client.ComponentService: Make highlightComponent non-blocking'
  - '[x] 8210 Create standalone Neural Link Bridge process'
  - '[x] 8211 Update ConnectionService to use Neural Link Bridge'
  - '[x] 8209 Fix silent failure in Neural Link ConnectionService startup'
  - '[x] 8212 Enhance Neural Link Health Check with detailed diagnostics'
  - '[x] 8213 Log App Name in Neural Link Bridge connections'
  - '[x] 8214 Fix Neural Link Server startup crash due to health check schema mismatch'
  - '[x] 8215 Expose connected agents in Neural Link health check'
  - '[x] 8216 Fix Neural Link server startup crash due to missing startServer/stopServer methods'
  - '[x] 8222 Fix Neural Link Recovery: Exempt server control tools from health check gate'
  - '[x] 8223 Investigate and Fix get_component_tree Timeout'
  - '[x] 8271 [Neural Link] Refactor ComponentService to use toJSON protocol'
  - '[x] 8272 [Neural Link] Refactor DataService to use toJSON protocol'
  - '[x] 8273 [Neural Link] Refactor RuntimeService to use toJSON protocol'
  - '[x] 8274 [Neural Link] Parameterize inspectStore limit and offset'
  - '[x] 8278 [Neural Link] Feature: Tool get_dom_event_listeners'
  - '[x] 8279 [Neural Link] Feature: Tool get_dom_event_summary'
  - '[x] 8280 [Neural Link] Feature: Tool inspect_class'
  - '[x] 8281 [Neural Link] Feature: Tool get_computed_styles'
subIssuesCompleted: 68
subIssuesTotal: 70
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
- 2025-12-30 @tobiu added sub-issue #8210
- 2025-12-30 @tobiu added sub-issue #8211
- 2025-12-30 @tobiu added sub-issue #8209
- 2025-12-30 @tobiu added sub-issue #8212
- 2025-12-30 @tobiu added sub-issue #8213
- 2025-12-30 @tobiu added sub-issue #8214
- 2025-12-30 @tobiu added sub-issue #8215
- 2025-12-30 @tobiu added sub-issue #8216
- 2025-12-30 @tobiu added sub-issue #8222
- 2025-12-30 @tobiu added sub-issue #8223
- 2026-01-01 @tobiu added sub-issue #8271
- 2026-01-01 @tobiu added sub-issue #8272
- 2026-01-01 @tobiu added sub-issue #8273

