# Introduction to MCP & The Agent OS

Neo.mjs v11.8.0 introduces a paradigm shift in how we think about AI-assisted development. We have moved beyond simple "tool use" scripts to a comprehensive **Agent OS** architecture, powered by the **Model Context Protocol (MCP)**.

This guide explains what MCP is, why we adopted it, and how it transforms the Neo.mjs Application Engine into a self-aware development environment.

## What is the Model Context Protocol (MCP)?

The **[Model Context Protocol (MCP)](https://modelcontextprotocol.io/)** is an open standard that standardizes how AI agents interact with external data and tools.

Before MCP, connecting an AI to a new data source (like a database, a GitHub repository, or a Slack workspace) required writing custom integration code for every specific AI model. This created a fragmented ecosystem where tools worked with one agent but not another.

MCP solves this by defining a universal "language" for AI connections.
*   **Servers** expose **Resources** (data to read) and **Tools** (functions to execute).
*   **Clients** (like Claude Desktop, Gemini, or our own SDK) connect to these servers and automatically discover their capabilities.

Think of it as a **USB-C port for AI**. Any agent that speaks MCP can plug into our development environment and immediately understand how to work with it.

## Why Neo.mjs Adopted MCP

We chose MCP as the backbone of our AI strategy for three key reasons:

### 1. Agent Agnosticism

We believe developers should choose their intelligence provider. Whether you prefer **Claude**, **Gemini**, **OpenAI**, or a local **Llama** model, the interface to the Neo.mjs codebase remains identical. Our MCP servers provide a stable contract that abstracts away the underlying model differences.

### 2. Code Execution ("The Thick Client")

Traditional AI tools often treat the agent as a passive chat bot that asks a server to do things one by one. MCP enables a **"Thick Client"** architecture (what Anthropic calls [Code Execution](https://www.anthropic.com/engineering/code-execution-with-mcp)).

In this model, the agent isn't just a chat bot; it's a developer writing and running code. It can import our `ai/services.mjs` SDK and write complex, autonomous scripts to:
*   Monitor the codebase for issues.
*   Query the knowledge base for context.
*   Plan multi-step refactoring tasks.
*   Execute tests and verify fixes.

### 3. Standardization & Security

MCP provides a robust security model. Our servers run over `stdio` (standard input/output), meaning they run as local subprocesses. They don't require opening network ports or exposing your local file system to the internet. The protocol ensures that agents can only access what the servers explicitly expose.

## The "Agent OS" Architecture

The Agent OS consists of four specialized MCP servers that work together to give the agent a complete "brain":

### 1. The Knowledge Base Server (`neo.mjs-knowledge-base`)

*   **Role:** The Technical Cortex.
*   **Function:** Provides semantic understanding of the codebase. It indexes source code, guides, and historical tickets using vector embeddings.
*   **Capability:** Allows agents to ask high-level questions like "How does the VDOM diffing algorithm work?" and get precise, cited answers from the source.

### 2. The Memory Core Server (`neo.mjs-memory-core`)

*   **Role:** The Hippocampus (Long-term Memory).
*   **Function:** Gives the agent persistence. It records every thought, decision, and outcome.
*   **Capability:** Allows agents to learn from experience. An agent can recall "How did I fix that race condition last week?" and apply the same solution today.

### 3. The GitHub Workflow Server (`neo.mjs-github-workflow`)

*   **Role:** The Executive Function (Task Management).
*   **Function:** Bridges the local environment with GitHub. It syncs issues and PRs as local markdown files.
*   **Capability:** Enables "Offline-First" project management. Agents can review PRs, manage tickets, and plan sprints without hitting API rate limits.

### 4. The Neural Link Server (`neo.mjs-neural-link`)

*   **Role:** The Visual Cortex & Hands.
*   **Function:** Connects directly to the running application runtime.
*   **Capability:** Allows agents to see the component tree, inspect state, and manipulate the UI in real-time. It turns the "Blind Architect" into a "Sighted Developer" who can verify their own work.

## Shared Architectural Patterns

All servers share a common architectural DNA, leveraging the Neo.mjs core itself for backend development:

### 1. OpenAPI-Driven Design

Each server defines its capabilities in a strict **OpenAPI 3.0 Specification** (`openapi.yaml`). This file is the single source of truth.
*   **Automatic Tool Generation:** The server reads this file at startup to generate Zod validation schemas and MCP tool definitions dynamically.
*   **Self-Documentation:** The API documentation *is* the tool definition, ensuring agents always have accurate descriptions.

### 2. Neo.mjs Singleton Services

The servers are built using the **Neo.mjs Class System**. Every service (e.g., `QueryService`, `SessionService`) is a Neo.mjs Singleton.
*   **Lifecycle Management:** Services use `initAsync()` and `ready()` hooks for robust dependency orchestration.
*   **Reactive Configs:** Runtime configuration is handled via the core's reactive config system, ensuring type safety and validation.

### 3. Transport Agnosticism

While our default configuration uses `stdio` (standard input/output) for maximum security (local subprocesses only), the architecture is transport-agnostic. The servers can be easily exposed via HTTP/SSE for remote usage if needed, as the business logic is fully decoupled from the transport layer.

## Getting Started

To start using the Agent OS, you need to configure your AI client to connect to these servers.

If you are using **Claude Desktop** or a compatible generic MCP client, the configuration is generated for you in `.gemini/settings.json` (or can be manually configured).

If you are building **autonomous agents**, you can import the SDK directly:

```javascript readonly
import { KB_QueryService, GH_IssueService } from './ai/services.mjs';

// Your agent code here...
```
