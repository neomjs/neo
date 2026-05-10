---
id: 7961
title: 'Epic: Agent Cognitive Runtime'
state: CLOSED
labels:
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-01T10:21:58Z'
updatedAt: '2025-12-01T16:00:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7961'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 7962 Implement Neo.ai.provider.Base'
  - '[x] 7963 Implement Neo.ai.provider.Gemini'
  - '[x] 7964 Create ContextAssembler for memory integration'
  - '[x] 7965 Implement Event Queue and Agent Loop'
  - '[x] 7966 Implement Safety Guardrails for Agent'
  - '[x] 7968 Integrate Cognitive Loop into Agent Class'
subIssuesCompleted: 6
subIssuesTotal: 6
blockedBy: []
blocking: []
closedAt: '2025-12-01T16:00:03Z'
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

## Timeline

- 2025-12-01T10:21:59Z @tobiu added the `epic` label
- 2025-12-01T10:21:59Z @tobiu added the `ai` label
- 2025-12-01T10:21:59Z @tobiu added the `architecture` label
- 2025-12-01T10:39:32Z @tobiu assigned to @tobiu
- 2025-12-01T10:59:42Z @tobiu cross-referenced by #7962
- 2025-12-01T10:59:46Z @tobiu cross-referenced by #7963
- 2025-12-01T10:59:56Z @tobiu added sub-issue #7962
- 2025-12-01T10:59:59Z @tobiu added sub-issue #7963
- 2025-12-01T11:32:05Z @tobiu cross-referenced by #7964
- 2025-12-01T11:32:09Z @tobiu added sub-issue #7964
- 2025-12-01T12:12:52Z @tobiu cross-referenced by #7965
- 2025-12-01T12:12:56Z @tobiu added sub-issue #7965
- 2025-12-01T12:46:07Z @tobiu cross-referenced by #7966
- 2025-12-01T12:46:10Z @tobiu added sub-issue #7966
- 2025-12-01T15:40:23Z @tobiu cross-referenced by #7968
- 2025-12-01T15:40:27Z @tobiu added sub-issue #7967
- 2025-12-01T15:42:31Z @tobiu added sub-issue #7968
- 2025-12-01T15:42:56Z @tobiu removed sub-issue #7967
### @tobiu - 2025-12-01T15:59:42Z

**Input from Gemini 2.5:**

> ✦ Completed **Epic #7961: Agent Cognitive Runtime**.
> 
> **Achievements:**
> 1.  **Strategic Pivot:** Shifted focus to "Cognitive Runtime First" to give the Agent a brain before building the nervous system (WebSocket).
> 2.  **Model Abstraction Layer:** Implemented `Neo.ai.provider.Base` and `Neo.ai.provider.Gemini`. Secured API keys via `requiredEnv`.
> 3.  **Context & Memory:** Created `Neo.ai.context.Assembler` using the "Thick Client" pattern to directly access `memory-core` services for short-term history and RAG (Long-Term Memory + KB).
> 4.  **Event Loop:** Implemented `Neo.ai.agent.Scheduler` (Priority Queue) and `Neo.ai.agent.Loop` (Stimulus-Response Cycle) with Token Bucket rate limiting.
> 5.  **Integration:** Upgraded `Neo.ai.Agent` to instantiate and orchestrate the cognitive runtime while preserving legacy MCP Client capabilities.
> 6.  **Verification:** Validated end-to-end flow with `ai/examples/test-agent.mjs` (Agent -> Loop -> Scheduler -> Assembler -> Provider -> Gemini).
> 
> **Next Steps:**
> - Proceed with **Spike #7960** (WebSocket RMA) to give the Agent "Eyes" (Telemetry) and "Remote Hands" (RPC).
> - The WebSocket `onMessage` handler will now simply call `agent.schedule(event)`, enabling the "Neural Link".

- 2025-12-01T16:00:03Z @tobiu closed this issue
- 2025-12-01T16:04:24Z @tobiu cross-referenced by #7969
- 2025-12-01T16:04:28Z @tobiu cross-referenced by #7970

