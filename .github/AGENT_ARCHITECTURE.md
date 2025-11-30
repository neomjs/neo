# Agent-App Integration Architecture: The Neural Link

## Vision
Enable real-time, bidirectional communication between AI agents (Node.js) and Neo.mjs applications (Browser) via WebSocket RMA. This creates a "Neural Link" allowing autonomous agents to observe, react to, and manipulate visual interfaces as first-class citizens of the runtime environment.

## System Architecture

### Topology
```
[Agent Cluster (Node.js)] <---> [WebSocket Server] <---> [Browser Windows (Neo.mjs)]
       |                                                       ^
       |                                                       |
       +---(MCP Tool Calls)---> [MCP Servers] -----------------+
```

## Architectural Pillars

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

## Implementation Roadmap

### Phase 0: Spike
1.  **Proof of Concept:** Build a minimal bidirectional RPC example to validate Agent -> Browser calls.

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
