# Neo.mjs Project Roadmap

This document outlines the high-level strategic direction and priorities for the Neo.mjs framework.

## Vision: The Corporate HQ for AI Agents

Our core vision is to position Neo.mjs not just as a frontend framework, but as the **Operating System and Corporate Headquarters for the AI Workforce**. We are moving beyond simple "tool use" to a future where software is built by a hierarchical swarm of specialized agents (Strategic CEOs, Tactical PMs, Execution Drones), all managed through a powerful, multi-window Neo.mjs interface.

## Current Focus: The Agent OS Foundation (v11.x)

We have successfully established the "Single Agent, Rich Context" baseline. The foundation is now in place:
-   **Context Engineering:** The Knowledge Base (RAG) provides deep understanding of the codebase.
-   **Memory Core:** Agents have persistent, cross-session memory.
-   **AI SDK:** The `ai/services.mjs` library allows direct code execution in Node.js.

The next phase is to evolve from a single agent to a coordinated organization.

### Phase 1: The Connected Organization (v11.x Late)

**Goal:** Enable "Fire and Forget" task delegation across repositories using existing infrastructure.

Instead of building complex real-time message buses immediately, we will leverage **GitHub Issues** as a robust, asynchronous "Job Board" for the swarm.

*   [x] **Ticket-Driven Protocol:** Define a strict schema for `agent-task` labels and issue templates. This turns GitHub into the communication bus between agents.
*   [ ] **Cross-Repo Management:** Enhance the `github-workflow` MCP server to support creating and scanning issues across the entire organization (e.g., Middleware Agent assigning a task to the Framework Agent).
*   [x] **Value:** Immediate ability for an agent in one repo to "queue" work for an agent in another, without requiring simultaneous execution.

### Phase 2: The Headless Workforce (v12.0)

**Goal:** Move beyond the "Black Box" CLI by creating a native **Headless Agent SDK**.

We will empower developers (and the "CEO Agent") to spawn specialized agents programmatically as lightweight Node.js processes.

*   [x] **Role-Based Scripts (MVP):** Created specialized, standalone scripts using the "Fake Agent" pattern (Direct Service Import):
    *   `ai/agents/pm.mjs`: Scans Epics, breaks them down into User Stories (Issues).
    *   `ai/agents/dev.mjs`: Scans open Issues, writes code, runs tests, and submits PRs.
*   [x] **The "Feature Factory" Experiment:** A proof-of-concept where a single command triggers a chain of agents.
*   [ ] **Neo.ai.Agent Class:** (Deferred) Standardize the scripts into a formal SDK class structure.

### Phase 3: The Command Center (v12.x) - **[NEXT PRIORITY]**

**Goal:** The "Killer App" — A multi-window Neo.mjs application to visualize and control the swarm.

We will build the **Neo Command Center** (`apps/agent-os`), a desktop-class UI that serves as the "God View" for your digital organization.

*   **Visual Orchestration:** A real-time graph showing active agents, their current tasks, and their status.
*   **Live Thought Streams:** Click any agent node to open a window streaming its live `THOUGHT` logs.
*   **Human-in-the-Loop:** A "Plan Verification" mode where Strategic Agents propose a plan in the UI, and the human Chairman approves it before execution proceeds.
*   **Competitive Edge:** This leverages Neo.mjs's unique multi-window and shared-worker capabilities to provide an interface that single-tab competitors cannot match.

### Phase 4: The Neural Link (Bidirectional Agent Integration) - **[RESEARCH]**

**Goal:** Move beyond "Pull-based" tool use to a real-time, event-driven "Push/Pull" architecture.

See [.github/AGENT_ARCHITECTURE.md](.github/AGENT_ARCHITECTURE.md) for the detailed technical specification.

*   **Bidirectional WebSocket RMA:** Enable Node.js Agents to invoke methods on Browser Apps (RPC) and vice-versa.
*   **Telemetry Bridge:** Push Worker console logs and framework events to Agents in real-time, bypassing the need for Chrome DevTools polling.
*   **Security Model:** A capability-based permission system for Agent-initiated browser actions.

### Phase 5: Decoupling the Ecosystem (Future)

**Goal:** Evolve our general-purpose AI tools into standalone, reusable packages.

*   **Publish MCP Servers to npm:** The **Memory Core** and **GitHub Sync** MCP servers will be published as independent packages.
*   **Visual Service:** Evolve the "Sighted Agent" concept into a service that allows agents to programmatically capture screenshots and inspect the A11y tree.
*   **Hybrid Distribution:** Split AI capabilities into "Core" (logic) and "Server" (MCP wrappers) packages to support both embedded SDK use and external CLI use.

