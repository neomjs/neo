---
id: 7960
title: 'Spike: Bidirectional RMA Proof of Concept'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-11-30T21:58:20Z'
updatedAt: '2025-12-04T03:45:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7960'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 8001 Implement App Worker MCP Server PoC (Neural Link)'
  - '[x] 8002 Refactor App Worker MCP Server to use ToolService'
  - '[x] 8003 Make AI Tooling Dependencies Optional'
  - '[x] 8004 Create Dedicated Example App for AI Bridge Testing'
  - '[x] 8007 Implement Dynamic Loading for NeuralLink'
  - '[x] 8010 Align Neural Link MCP Server with Memory Core Server'
  - '[x] 8008 Create Neural Link Testbed App'
  - '[x] 8013 Implement End-to-End Tests for Neural Link'
  - '[x] 8006 Implement Neo.ai.NeuralLink (App Worker)'
  - '[x] 8014 Update ai/services.mjs to use Neural Link'
subIssuesCompleted: 10
subIssuesTotal: 10
blockedBy: []
blocking: []
closedAt: '2025-12-04T03:45:44Z'
---
# Spike: Bidirectional RMA Proof of Concept

**Goal:** Validate core technical assumptions with a minimal working prototype.

**Time-box:** 2-3 days

**Connection Model:**
**Browser Connects to Agent Server** (Agent runs WebSocket server).

**Deliverables:**
1.  Minimal `Neo.ai.server.WebSocket` (50 lines).
2.  Agent can call ONE browser method: `createNeoInstance`.
3.  Browser can call ONE agent method: `analyzeComponent`.
4.  Document unexpected challenges.

**Validation Checklist:**
- [ ] **Message Ordering:** Verify RPC call -> response correlation.
- [ ] **Lifecycle:** Connection survives browser tab backgrounding.
- [ ] **Payloads:** Can handle large payloads (>1MB).
- [ ] **Latency:** Measure round-trip time under load.
- [ ] **Error Propagation:** Agent exception -> Browser catch block (and vice-versa).
- [ ] **Multi-window Routing:** Can target specific windowId.

**Success Criteria:**
-   Demonstrates bidirectional RPC works.
-   Measures baseline latency.
-   Identifies hidden complexity.

**Non-Goals:**
-   Security (hardcoded capabilities).
-   Production quality (prototype code).

**Blockers:**
-   Need to understand Neo's existing WebSocket RMA internals.

**Reference:** .github/AGENT_ARCHITECTURE.md

## Timeline

- 2025-11-30T21:58:21Z @tobiu added the `enhancement` label
- 2025-11-30T21:58:21Z @tobiu added the `ai` label
- 2025-11-30T21:58:21Z @tobiu added the `architecture` label
- 2025-12-01T10:57:35Z @tobiu cross-referenced by #7961
- 2025-12-03T01:56:08Z @tobiu added sub-issue #8001
- 2025-12-03T01:56:09Z @tobiu added sub-issue #8002
- 2025-12-03T01:56:10Z @tobiu added sub-issue #8003
- 2025-12-03T01:56:11Z @tobiu added sub-issue #8004
- 2025-12-03T09:56:02Z @tobiu cross-referenced by #8006
- 2025-12-03T09:56:18Z @tobiu cross-referenced by #8007
- 2025-12-03T09:56:27Z @tobiu cross-referenced by #8008
- 2025-12-03T13:43:13Z @tobiu added sub-issue #8007
- 2025-12-03T14:06:43Z @tobiu added sub-issue #8010
- 2025-12-03T14:07:13Z @tobiu added sub-issue #8008
- 2025-12-03T21:38:10Z @tobiu assigned to @tobiu
- 2025-12-03T21:40:30Z @tobiu added sub-issue #8013
- 2025-12-03T21:50:11Z @tobiu added sub-issue #8006
- 2025-12-03T22:12:02Z @tobiu added sub-issue #8014
### @tobiu - 2025-12-04T03:45:44Z

resolved

- 2025-12-04T03:45:44Z @tobiu closed this issue

