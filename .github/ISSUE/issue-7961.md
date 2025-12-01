---
id: 7961
title: 'Epic: Agent Cognitive Runtime'
state: OPEN
labels:
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-01T10:21:58Z'
updatedAt: '2025-12-01T10:57:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7961'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - 7962
  - 7963
  - 7964
  - 7965
subIssuesCompleted: 3
subIssuesTotal: 4
blockedBy: []
blocking: []
---
# Epic: Agent Cognitive Runtime

**Goal:** Transform `Neo.ai.Agent` from a passive tool wrapper into an autonomous daemon with perception, reasoning, and action capabilities.

**Scope:**
1.  **Model Abstraction Layer:**
    *   `Neo.ai.provider.Base`: Abstract base class for AI providers.
    *   `Neo.ai.provider.Gemini`: Concrete implementation for Google Gemini API.
    *   Interface methods: `generate()`, `stream()`.
2.  **Context & Memory Integration:**
    *   **Short-Term Memory:** Logic to hydrate the context window using `memory-core` (via `get_session_memories`).
    *   **Long-Term Memory (RAG):** Integration of `query_raw_memories` to retrieve relevant past problem-solving patterns.
    *   **Shared Awareness:** Capability to query other agents' sessions to coordinate work.
    *   **Token Management:** A `ContextAssembler` that combines System Prompt + Memory Core History + RAG Results + Current Event into a valid LLM payload.
3.  **Event Queue & Loop:**
    *   `PriorityQueue` for handling incoming signals (System vs User vs Telemetry).
    *   The "Stimulus-Response Loop": `Perceive` -> `Reason` (LLM) -> `Act` (Tools/RPC) -> `Reflect`.
4.  **Reflection & Learning:**
    *   After each action, Agent evaluates:
        *   Did the action succeed? (Check tool result)
        *   Did it achieve the intended goal? (Compare state before/after)
        *   Should I remember this pattern? (Store to memory-core)
    *   Failed actions trigger retry with alternative approach.
    *   Successful patterns stored for future reference.
5.  **Synthetic Prompt Generation:**
    *   Templates to wrap system events (logs, errors) into LLM-readable prompts.
6.  **Safety Guardrails:**
    *   Rate limiting (max actions/minute).
    *   Human-in-the-loop gates for critical actions (`component:destroy`).

**Implementation Priority:**
1.  **Phase 1:** Model Abstraction Layer (Foundation)
2.  **Phase 2:** Context & Memory Integration (Cognition)
3.  **Phase 3:** Event Queue & Loop (Autonomy)
4.  **Phase 4:** Safety Guardrails (Production-ready)

**Example Scenario: Autonomous Error Recovery**
1.  **Perceive:** LogBridge sends `[ERROR] Button-1 failed to mount`
2.  **Reason:** LLM receives synthetic prompt with error context
    *   LLM decides: "I need to inspect the component config"
3.  **Act:** Agent calls `inspectComponent('Button-1')` via RPC
    *   Result: Missing required prop `text`
4.  **Reason:** LLM receives inspection result
    *   LLM decides: "I should fix the config"
5.  **Act:** Agent calls `setConfigs({id: 'Button-1', text: 'Default'})`
6.  **Reflect:** Agent checks if error persists
    *   Success → Store pattern to memory-core
    *   Failure → Escalate to human

**Agent Initialization Sequence:**
1.  Load configuration (API keys, capabilities, MCP servers).
2.  Connect to MCP servers (github-workflow, memory-core, etc.).
3.  Establish WebSocket connection to browser (if applicable).
4.  Hydrate context from memory-core (last session state).
5.  Enter idle state, listening for events.
6.  Send "Agent Ready" notification.

**Dependencies:**
*   **Blocked by:** None (can start immediately).
*   **Blocks:**
    *   Epic #7960 (Spike needs a consumer for events).
    *   Epic #7958 (Telemetry needs cognitive loop to process logs).
*   **Integration Points:**
    *   When Epic #7957 (WebSocket RMA) is complete, wire it into event queue.
    *   When Epic #7958 (LogBridge) is complete, subscribe to log events.

**Success Criteria:**
*   [ ] Agent runs as a persistent daemon (uptime > 1 hour without crash).
*   [ ] Agent processes events from queue with <100ms latency.
*   [ ] Agent maintains context across 50+ interactions without degradation.
*   [ ] Agent demonstrates "Reflection" in 3/5 test scenarios.
*   [ ] Agent obeys rate limits (0 violations in 1-hour test).
*   [ ] Human approval gates work (100% block rate for restricted actions).

**Non-Goals (Out of Scope for Epic #7961):**
*   Multi-agent coordination (future epic).
*   WebSocket connection implementation (Epic #7957).
*   LogBridge implementation (Epic #7958).
*   Production-grade fault tolerance (Phase 2).
*   UI for monitoring agent state (separate feature).

**Proposed Sub-Issues:**
1.  [ ] Implement `Neo.ai.provider.Base` abstract class.
2.  [ ] Implement `Neo.ai.provider.Gemini` with API integration.
3.  [ ] Create `ContextAssembler` for memory integration.
4.  [ ] Implement `PriorityQueue` with event categorization.
5.  [ ] Build stimulus-response loop in `Agent.run()`.
6.  [ ] Add reflection logic and pattern storage.
7.  [ ] Implement rate limiting and human approval gates.
8.  [ ] Write integration tests for autonomous scenarios.

**Testing Approach:**
*   **Unit Tests:** Provider API calls, queue operations, rate limiting.
*   **Integration Tests:** End-to-end scenarios with mock MCP servers.
*   **Stress Tests:** 1000 events/minute, context window overflow.
*   **Safety Tests:** Verify human gates prevent unauthorized actions.

**Reference:** `.github/AGENT_ARCHITECTURE.md`

## Activity Log

- 2025-12-01 @tobiu added the `epic` label
- 2025-12-01 @tobiu added the `ai` label
- 2025-12-01 @tobiu added the `architecture` label
- 2025-12-01 @tobiu assigned to @tobiu
- 2025-12-01 @tobiu cross-referenced by #7962
- 2025-12-01 @tobiu cross-referenced by #7963
- 2025-12-01 @tobiu added sub-issue #7962
- 2025-12-01 @tobiu added sub-issue #7963
- 2025-12-01 @tobiu cross-referenced by #7964
- 2025-12-01 @tobiu added sub-issue #7964
- 2025-12-01 @tobiu cross-referenced by #7965
- 2025-12-01 @tobiu added sub-issue #7965

