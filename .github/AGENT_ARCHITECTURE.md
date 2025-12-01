# Agent-App Integration Architecture: The Neural Link

## Vision
Enable real-time, bidirectional communication between AI agents (Node.js) and Neo.mjs applications (Browser) via WebSocket RMA. This creates a "Neural Link" allowing autonomous agents to observe, react to, and manipulate visual interfaces as first-class citizens of the runtime environment.

## System Architecture

### Topology

```
      [ Autonomous Agent (Node.js) ]
      +------------------------------------------+
      |  [ Event Priority Queue ]                |
      |    ^      ^       ^                      |
      |    |      |       |                      |
      | (Logs) (Events) (User)                   |
      |    |      |       |                      |
      |  [ Cognitive Loop ] <---> [ LLM Model ]  |
      |    |      |                              |
      |    v      v                              |
      |  [ Context Window ]                      |
      |    |                                     |
      |    v                                     |
      |  [ Action Dispatcher ]                   |
      +----+--------------+----------------------+
           |              |
      (WebSocket)     (MCP Tools)
           |              |
           v              v
    [ Browser App ]   [ GitHub / FS ]
```

## Architectural Pillars

### Pillar 0: The Cognitive Runtime (New Foundation)
Transforming the Agent from a passive script to an autonomous daemon.

**The Stimulus-Response Loop:**
1.  **Perceive:** Events (Errors, User Prompts, DOM Changes) enter a **Priority Queue**.
    *   *Critical:* System Crashes, Security Alerts.
    *   *High:* User Input.
    *   *Normal:* State Changes.
    *   *Low:* Telemetry noise.
2.  **Reason:** The Agent wraps the event in a "Synthetic Prompt" and queries the **LLM Model**.
3.  **Act:** The LLM decides to call a Tool (MCP) or send a Remote Command (RPC).
4.  **Reflect:** The Agent observes the result of its action and updates its Context Window.

**Components:**
-   **`Neo.ai.model.Base`:** Abstract layer for LLM providers (Gemini, OpenAI).
-   **`ContextWindow`:** Manages token limits, history compression, and long-term memory retrieval.
-   **`Guardrails`:** Rate limiting and human-approval gates for destructive actions.

### Pillar 1: Bidirectional WebSocket RMA
The core communication backbone.

**Connection Model: Browser Connects to Agent Server** (Recommended)
-   **Mechanism:** Agent runs WebSocket server (e.g., localhost:8080). Browser connects via `Neo.main.addon.Remote` using `Neo.config.remotesApiUrl`.
-   **Reasoning:** Agents are long-lived services; browser tabs are ephemeral. Standard client-server pattern.

**RPC Flows:**
-   **Browser -> Agent:** (Existing)
    -   App Worker calls backend services via `remotes-api.json`.
    -   Example: `await AgentOS.agents.Analyzer.analyzeComponent({...})`
-   **Agent -> Browser:** (New Capability)
    -   Node.js Agent calls App Worker methods (RPC) via WebSocket.
    -   Example: `await browserApp.call('Neo.worker.App.createNeoInstance', {...})`
    -   **Requirement:** Implement reverse RPC routing in `Neo.worker.mixin.Remote`.

**Message Format:**
```json
// Agent -> Browser (RPC Call)
{
  "type": "rpc",
  "id": "uuid-v4",
  "method": "Neo.worker.App.createNeoInstance",
  "params": {...},
  "windowId": "neo-window-1",
  "timeout": 5000
}

// Browser -> Agent (RPC Response)
{
  "type": "rpc_response",
  "id": "uuid-v4",
  "result": {...},
  "error": null
}

// Browser -> Agent (Event Push)
{
  "type": "event",
  "name": "neo:error",
  "data": {...},
  "windowId": "neo-window-1",
  "timestamp": 1234567890
}
```

### Pillar 2: Event & Log Telemetry
Solving the "Blind Agent" problem.
-   **Strategy A (Phase 1 - Immediate):** `Neo.worker.mixin.LogBridge`
    -   A Worker-side interceptor that overrides `console.*` and `globalThis.onerror`.
    -   Forwards serializable logs via the WebSocket RMA channel to the Agent.
    -   Provides immediate observability without external dependencies.
-   **Strategy B (Phase 2 - Future):** MCP DevTools Enhancement
    -   Contribute support for `worker` and `shared_worker` targets to the MCP DevTools server.
-   **Semantic Event Stream:**
    -   Agents can subscribe to high-level Neo.mjs framework events (`neo:component:mount`, `neo:window:connect`).
    -   **Event Filtering:** Agents specify subscriptions (e.g., `agent.subscribe(['neo:error'])`) to avoid noise.

### Pillar 3: Security & Capabilities
Safe autonomous control.
-   **Threat Model:** Malicious/Buggy Agents, Compromised Connections.
-   **Mitigations:**
    -   **Capability Tokens:** Signed JWTs defining permitted actions.
    -   **Default Deny:** All capabilities require explicit grant.
    -   **Kill Switch:** Ability to revoke agent access instantly.
-   **Example Roles:**
    -   **Observer:** `component:read`, `log:read`
    -   **Developer:** `component:create`, `component:update`, `config:set`
    -   **Admin:** `component:destroy`, `window:manage`
    -   **Forbidden:** `code:eval`

### Pillar 4: Agent-Spawned Applications
Dynamic workspace expansion.
-   **Mechanism:**
    -   Agent calls `Neo.Main.windowOpen({ app: 'agent-task-view' })`.
    -   Agent injects the initial state/configuration for the new window.

## Operational Resilience

### Reconnection Strategy
-   **On Browser Disconnect:** Agent marks window as "offline" but keeps state for 30s. Reconnection restores subscriptions.
-   **On Agent Restart:** Browser attempts exponential backoff reconnection (1s to 30s). Agent recovers state from Memory Core.
-   **Heartbeat:** 10s ping/pong to detect network partitions.

### Known Failure Modes
-   **Single Point of Failure:** WebSocket server crash stops all comms. Mitigation: Auto-restart & browser retry.
-   **State Desync:** Stale agent view. Mitigation: Browser sends full snapshot on reconnect.
-   **Serialization Errors:** `JSON.stringify` failures in params. Mitigation: Reject early, log warning.
-   **Runaway Agent:** Agent enters a loop of destructive actions. Mitigation: Rate limiting (actions/min) & Human-in-the-loop for critical ops.

## Implementation Roadmap

### Phase 0A: Cognitive Runtime (Priority 1)
1.  **Model Layer:** Implement `Neo.ai.model.Base` and `Neo.ai.model.Gemini`.
2.  **Loop:** Implement `Agent.chat()` loop with Context Window.
3.  **Events:** Implement `PriorityQueue` for incoming signals.

### Phase 0B: The Neural Link Spike (Priority 2 - Parallel)
1.  **Proof of Concept:** Build minimal bidirectional RPC (Agent -> Browser).
2.  **Integration:** Wire WebSocket `onMessage` directly into the Agent's Event Queue.

### Phase 1: Infrastructure
1.  Design `agent-api.json` schema.
2.  Implement `Neo.ai.server.WebSocket`.
3.  Verify bidirectional RMA.

### Phase 2: Observability
1.  Implement `Neo.worker.mixin.LogBridge`.
2.  Create the "Agent Console" view in the Command Center.

### Phase 3: Control & Security
1.  Implement Capability enforcement middleware.
2.  Define standard Agent Roles.