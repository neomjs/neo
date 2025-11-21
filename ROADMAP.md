# Neo.mjs Project Roadmap

This document outlines the high-level strategic direction and priorities for the Neo.mjs framework.

## Vision: The "Thick Client" for AI Agents

Our core vision is to position Neo.mjs not just as a frontend framework, but as the **Operating System for AI Agents**. By leveraging our Node.js compatibility, robust class system, and "batteries included" architecture, we provide the structured "brain" (Context Engineering) that powers Anthropic's "Code Execution" pattern.

## Current Focus: The Agent OS (v11.x)

We are currently evolving our AI infrastructure to move beyond simple "tool use" and into full **Code Execution**. This means transforming our internal tools into a robust SDK that agents can import and script against directly.

### 1. Architectural Enhancements (Code Execution Readiness)

**Goal:** Enable agents to import and use our intelligent services directly as libraries, without the MCP protocol overhead.

-   **Decouple Services (Completed):** Refactored `ai/mcp/server/*/services/*.mjs` to be importable as a standalone "AI SDK" (`ai/services.mjs`).
-   **Standardize Lifecycle (Completed):** Enforced the `initAsync()` and `ready()` pattern across AI services, ensuring robust handling of hybrid database states (managed vs. external) and eliminating race conditions.
-   **The "Neo Sandbox":** Create a lightweight boilerplate/config that sets up the Neo.mjs core in a Node.js script (handling `globalThis`, `Worker` mocks if needed) so agents can instantly start scripting.

### 2. New "Code Execution" Capabilities

**Goal:** Empower agents to write "smart" scripts that perform logic on the client side, reducing token usage and increasing accuracy.

-   **"Smart" Search Scripts (Completed):** Verified with `ai/examples/smart-search.mjs`.
-   **Automated Refactoring Agents:** Expose the `Neo.mjs` core (Component system, Config system) to the agent sandbox. Agents can instantiate components in Node.js to verify config validity using `Neo.create()` before committing code.
-   **AI SDK Testing:** Implement a dedicated test suite for `ai/services.mjs` to ensure the stability of the Agent OS infrastructure, treating it as a first-class framework component.

### 3. Visibility & Marketing ("Get Visibility")

**Goal:** Establish Neo.mjs as the premier framework for AI-Native development.

-   **"Context Engineering" Case Study:** Publish technical content comparing raw file dumping (Context Tax) vs. our semantic inheritance chain injection.
-   **"The Agent OS" Branding:** Update documentation to explicitly highlight "AI-Native" capabilities and "Architecture designed for Agent Code Execution."
-   **"Self-Healing" Repository (Completed):** Developed `ai/examples/self-healing.mjs` where an agent uses `GitHubWorkflow` + `KnowledgeBase` to autonomously read a bug report, query context, plan, and propose a fix.

## 4. Future: Decoupling the AI Tooling Ecosystem

**Goal:** Evolve our general-purpose AI tools into standalone, reusable packages.

-   **Publish MCP Servers to npm:** The **Memory Core** and **GitHub Sync** MCP servers will be published as independent packages to npm. This will allow the general-purpose servers to be consumed via `npx` by the broader AI development community. The Knowledge Base server will remain internal as it is tightly coupled with this project's source code.
-   **Sighted Agent Service:** Evolve the "Sighted Agent" concept into a `VisualService` within the AI SDK, allowing agents to programmatically capture screenshots, inspect the A11y tree, and run visual regression tests via Chrome DevTools.
-   **Multi-Agent Coordination:** Explore patterns for multiple agents to collaborate on complex tasks using the Memory Core as a shared blackboard state.

## 5. Architectural Evolution: Hybrid Distribution Model

**Goal:** Solve the tension between "Agent OS" (Direct SDK access) and "Standalone Tooling" (npx execution).

-   **Strategy:** Split future AI capabilities into "Core" vs. "Server" packages.
    -   **Core (`@neomjs/ai-*-core`):** Pure logic libraries (Services) that can be imported directly by the Agent SDK for high-performance "Code Execution".
    -   **Server (`@neomjs/ai-*-server`):** MCP wrappers around the Core libraries for external consumption via `npx`.
-   **Execution:** We will maintain the current monorepo structure to iterate quickly on the "Agent OS" SDK. Extraction into separate packages will occur only once the service APIs are stable. This ensures we don't lose the "Thick Client" performance advantage while eventually enabling broader ecosystem adoption.

