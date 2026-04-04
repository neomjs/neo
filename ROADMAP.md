# Neo.mjs Project Roadmap

This document outlines the high-level strategic direction and priorities for the Neo.mjs framework.

## Vision: The Corporate HQ for AI Agents

Our core vision remains to position Neo.mjs not just as a frontend framework, but as the **Operating System and Corporate Headquarters for the AI Workforce**. We are moving beyond simple "tool use" to a future where software is built by a hierarchical swarm of specialized agents (Strategic CEOs, Tactical PMs, Execution Drones), all managed through a powerful, multi-window Neo.mjs interface.

*Current Status Note: Due to unexpected complexities in integrating cross-system communication, we are adopting a highly disciplined, incremental scope approach. Focus is now entirely on achieving small, demonstrable wins.*

## Current Focus: The Agent OS Foundation (v11.x)

We have successfully established the "Single Agent, Rich Context" baseline. The foundation is solid, providing the necessary tools for advanced agent interaction.

-   **Context Engineering:** The Knowledge Base (RAG) provides deep understanding of the codebase.
-   **Memory Core:** Agents have persistent, cross-session memory.
-   **AI SDK:** The `ai/services.mjs` library allows direct code execution in Node.js.

The next phase is to evolve from a single agent to a coordinated organization.

### Phase 1: The Connected Organization (v11.x Late)

**Goal:** Establish reliable, asynchronous "Job Board" task delegation across repositories.

Instead of aiming for a complex real-time message bus, we will focus on stabilizing **GitHub Issues** as the primary, robust communication channel for the swarm.

*   [x] **Ticket-Driven Protocol:** Define and implement a strict schema for `agent-task` labels and issue templates. This successfully turns GitHub into the primary communication bus.
*   [ ] **Cross-Repo Task Scanning:** Enhance the `github-workflow` MCP server to reliably create and scan issues across the entire organization, ensuring Middleware Agents can assign tasks to Framework Agents.
*   [x] **Value:** Confirmed ability for one agent to "queue" structured work for an agent in a separate repository.

### Phase 2: The Headless Workforce (v12.0)

**Goal:** Move beyond the "Black Box" CLI by creating specialized, executable Agent functionalities.

We will empower developers (and the "CEO Agent") to spawn specialized agents programmatically as lightweight Node.js processes, ensuring minimal dependency overhead.

*   [x] **Role-Based Scripts (MVP):** Successfully prototyped specialized, standalone scripts using the "Fake Agent" pattern:
    *   `ai/agents/pm.mjs`: Generates Epics and breaks them down into User Stories (Issues).
    *   `ai/agents/dev.mjs`: Reads open Issues, generates initial code scaffolds, runs basic tests, and submits PRs.
*   [x] **The "Feature Factory" Experiment:** A stable Proof-of-Concept that triggers a chain of agents from a single command, demonstrating pipeline viability.
*   [ ] **Standardized Agent Interface:** (Refined Scope) Instead of a full SDK class, the immediate focus is on defining and stabilizing the minimal common I/O signature used by all role-based scripts.

### Phase 3: The Command Center (v12.x) - [REVISED NEXT PRIORITY]

**Goal:** Implement the foundational UI layer for visualizing and manually guiding the swarm.

We are pivoting from building the "God View" to building the **Core Control Panel** (`apps/agent-os`). This UI will be the first structured point of interaction for the human operator.

*   **Plan Confirmation UI:** Implement a minimal panel for displaying a multi-step proposed plan (received from the Strategic Agent) and providing a human "Chairman" approval button before execution. *This is our single most critical focus for v12.x.*
*   **Task Stream View:** Basic logging window to display aggregated, chronological `THOUGHT` and `OUTPUT` logs from active agents, replacing the complex "real-time graph" for now.
*   **Component Isolation:** Leverage Neo.mjs's multi-window capability to ensure that agent activities in one panel cannot bleed into the UI state of another.
*   **Competitive Edge:** Utilizing Neo.mjs's native capabilities to create a state-separated dashboard interface.

### Phase 4: The Self-Evolving App Platform (Runtime Orchestration) - [LONG-TERM RESEARCH]

**Goal:** Enable advanced, sophisticated interaction between AI Agents and running application state.

This remains a highly complex and foundational research pillar. We are de-scoping the *operational* complexity and focusing on *data acquisition* first.

*   **Diagnostic Reporting (V1):** Agents capture focused multi-thread error context (stack traces, failure context) and generate structured bug report payloads for human triage or automated bug tracker submission.
*   **Component Blueprint Generation:** Agents can inject or generate standardized JSON Blueprints for components, allowing the *UI* to visualize necessary changes without the Agent being able to write the component logic itself.
*   **Advanced Persistence:** Ensuring that temporary agent-driven changes are persisted reliably using modern browser storage APIs, moving beyond simple local state.

### Phase 5: Decoupling the Ecosystem (Future)

**Goal:** Modularize our general-purpose AI tools into standalone, reusable packages for maximum adoption flexibility.

*   **MCP Services Publication:** Publish the core Memory Core and GitHub Sync logic as independent, versioned packages (`@neomas/memory`, `@neomas/github-sync`).
*   **Visual Inspection Service:** Evolve the "Sighted Agent" concept into a basic service that programmatically captures and structures key accessibility (A11y) tree data points.
*   **Hybrid Distribution:** Support for both embedded SDK use within a frontend app and external CLI invocation for maximum user flexibility.