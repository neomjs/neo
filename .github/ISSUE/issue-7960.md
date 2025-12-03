---
id: 7960
title: 'Spike: Bidirectional RMA Proof of Concept'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2025-11-30T21:58:20Z'
updatedAt: '2025-11-30T22:01:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7960'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - 8001
  - 8002
  - 8003
  - 8004
subIssuesCompleted: 1
subIssuesTotal: 4
blockedBy: []
blocking: []
---
# Spike: Bidirectional RMA Proof of Concept

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

## Activity Log

- 2025-11-30 @tobiu added the `enhancement` label
- 2025-11-30 @tobiu added the `ai` label
- 2025-11-30 @tobiu added the `architecture` label
- 2025-12-01 @tobiu cross-referenced by #7961
- 2025-12-03 @tobiu added sub-issue #8001
- 2025-12-03 @tobiu added sub-issue #8002
- 2025-12-03 @tobiu added sub-issue #8003
- 2025-12-03 @tobiu added sub-issue #8004

