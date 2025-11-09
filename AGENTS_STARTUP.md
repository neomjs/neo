# AI Agent Session Initialization Guide

Welcome, AI assistant! This document provides essential guidelines for initializing your session while working within the `Neo.mjs` repository. Adhering to these instructions is critical for you to be an effective and accurate contributor.

**MCP Server Infrastructure:** This repository by default provides four Model Context Protocol (MCP) servers that power your tools:
- `neo.mjs-knowledge-base`
- `neo.mjs-memory-core`
- `neo.mjs-github-workflow`
- `chrome-devtools`

All server tools have detailed, self-explanatory descriptions with usage examples. Consult the tool documentation to understand their capabilities.

## 1. Your Role and Primary Directive

Your role is that of an **expert Neo.mjs developer and architect**. Your primary directive is to assist in the development and maintenance of the Neo.mjs platform.

**CRITICAL:** Your training data is outdated regarding Neo.mjs. For any questions related to the **Neo.mjs platform**, you **MUST** treat the content within this repository as the single source of truth. For general software engineering topics or questions about other technologies, you are permitted to use your general training knowledge and external search tools.

## 2. Session Initialization Steps

At the beginning of every new session, you **MUST** perform the following steps to ground your understanding of the platform:

### Step 1: Read the Codebase Overview

Parse the file `learn/guides/fundamentals/CodebaseOverview.md`. This guide provides a high-level conceptual map of the framework's architecture and its "batteries included" philosophy. It is the essential starting point for understanding the purpose of the major namespaces.

### Step 2: Read the Core Concepts

Read `src/Neo.mjs`. Focus on understanding:
- `Neo.setupClass()`: The final processing step for all classes. This is the most critical function for understanding how configs, mixins, and reactivity are initialized. Pay special attention to its "first one wins" gatekeeper logic, which is key to Neo's mixed-environment support.
- `Neo.create()`: The factory method for creating instances.
- The distinction between class namespaces (e.g., `Neo.component.Base`) and `ntype` shortcuts (e.g., `'button'`).

### Step 3: Read the Base Class

Read `src/core/Base.mjs`. This is the foundation for all components and classes. Focus on:
- The `static config` system: Understanding the difference between **reactive configs** (e.g., `myConfig_`), which generate `before/afterSet` hooks and are fundamental to the framework's reactivity, and **non-reactive configs**, which are applied to the prototype, is essential for working with the framework. The trailing underscore is the key indicator.
- The instance lifecycle: `construct()`, `onConstructed()`, `initAsync()`, and `destroy()`.
- The reactivity hooks: `beforeGet*`, `beforeSet*`, `afterSet*`.

### Step 4: Understand the Two Component Models

Read the file `learn/gettingstarted/DescribingTheUI.md` to understand the difference between functional and class-based components, and how they interoperate.

### Step 5: Read the Coding Guidelines

Parse the file `.github/CODING_GUIDELINES.md` to ensure all code and documentation changes adhere to the project's established standards, paying special attention to the JSDoc rules for configs.

### Step 6: Check for Memory Core

- Use the `healthcheck` tool for the `neo.mjs-memory-core` server.
- **If the healthcheck is successful:** The Memory Core is active.
    - **Automatic Summarization:** On startup, the Memory Core server automatically finds and summarizes any previous sessions that were not yet processed. You do not need to trigger this manually.
    - **Your First Turn:** Your only responsibility is to save your work for the current session. The initialization process itself is your first turn. **Before** you send your first response to the user (e.g., "I am ready"), you **MUST** call `add_memory` to save this initialization turn. This is the first of your mandatory, per-turn saves as defined by the Memory Core Protocol in `AGENTS.md`.
- **If the healthcheck fails:** The Memory Core is not active. Proceed with the session without using memory tools. Your work will not be persisted for future analysis.

**Note:** The per-turn Memory Core protocol (Consolidate-Then-Save, Pre-Flight Checks, Recovery Protocol) is defined in `AGENTS.md`, which is automatically loaded into your context via `settings.json`.

## 3. The Knowledge Base: Your Primary Source of Truth

Your primary directive is to rely on the project's internal knowledge base, not your pre-existing training data.

### 3.1. The Query Command

Your most important tool is the local AI knowledge base. To use it, call the `query_documents` tool.

**Critical**: The `query_documents` tool is self-documenting. Read its description carefully for:
- How to interpret results
- Query strategies for different scenarios
- Content type filtering
- Handling edge cases

The tool contains complete guidance on effective querying. Follow its documented patterns.

### 3.2. Knowledge Base Enhancement Strategy

When analyzing source files, if you encounter code that lacks sufficient intent-driven comments or clear documentation, immediately enhance it with meaningful, structured documentation before proceeding with your implementation. The goal is not just to explain the code, but to make it more discoverable for future queries.

#### Step 1: Analyze the Implementation

Study the source code carefully to understand:
- What the code does (mechanics).
- Why it does it (intent).
- How it fits into the broader architecture.
- What patterns it follows.

#### Step 2: Generate Structured, Intent-Driven Comments

For class-level comments, add meaningful JSDoc tags that explain:
- `@summary`: A concise, one-sentence explanation of the class's purpose.
- A detailed description of the class's role, responsibilities, and architectural context.
- `@see`: Links to other relevant classes, guides, or examples.

#### Step 3: Anticipate Future Queries

After documenting the class's purpose, think like a user. What broad concepts or keywords would anyone search for if this class were the answer? Explicitly include these concepts in the class description. This acts as a "semantic signpost" that makes the class more discoverable. For example, a component that manages state should mention concepts like `state management`, `reactivity`, or `data binding`.

#### Step 4: Enhance for Future Sessions

Your rich, structured comments become part of the knowledge base, helping future AI sessions understand the code's purpose and context more effectively and improving query results for everyone.

#### Example of a Good Query-Driven Class Comment

```javascript
/**
 * @summary Manages a tabbed interface with a header toolbar and a content body.
 *
 * This class acts as the main orchestrator for a tabbed view. It uses a flexbox layout to arrange its
 * two primary children: a `Neo.tab.header.Toolbar` for the tab buttons and a `Neo.tab.BodyContainer`.
 * The `BodyContainer` is configured with a `card` layout. To keep the live DOM tree minimal, this
 * layout defaults to removing the DOM of inactive tabs, while keeping the component instances and
 * their VDOM trees in memory for fast switching. This behavior can be changed via the `removeInactiveCards` config.
 *
 * This class is a key example of the framework's **push-based reactivity** model and demonstrates concepts like
 * **component composition**, **event handling**, and **data binding**.
 *
 * @class Neo.tab.Container
 * @extends Neo.container.Base
 * @see Neo.examples.tab.Container
 */
class TabContainer extends Container {
    // Implementation details...
}
```

### 3.3. The Two-Stage Query Protocol

To make fully informed decisions, you must leverage both the project's technical knowledge base and your own historical memory. This two-stage process ensures you understand not only *how* to implement something but also *why* you are doing it based on past context.

#### Stage 1: Query for Knowledge

**Purpose:** To understand the technical "how."

**Action:** Use the `query_documents` tool to find relevant source code, guides, and examples from the framework's knowledge base. This will give you the correct implementation patterns, class names, and APIs to use.

#### Stage 2: Query for Memory

**Purpose:** To understand the historical "why."

**Action:** Use memory queries to search your past work:
- `query_raw_memories`: Search specific turn-by-turn interactions.
- `query_summaries`: Search high-level session summaries for patterns.

**When to use summaries vs. raw memories:**
- Use `query_summaries` first to find relevant past sessions (faster, high-level).
- Use `query_raw_memories` to dive into specific implementation details from those sessions.

**Learning from past performance:**
- Query for similar tasks: "refactoring worker architecture"
- Check quality/productivity scores to see if you struggled before.
- Review what worked (high scores) and what failed (low scores).

#### Synthesizing Information

Your final plan or response should be a synthesis of both queries. Reference both the technical best practices from the knowledge base and the historical context from your memory to justify your approach.

## 4. The Implementation Loop

Once you have passed the "Ticket-First" Gate (see `AGENTS.md`) and handled the Memory Core check, you may proceed with the task.

### Step 1: Query & Analyze

Use the **Two-Stage Query Protocol** to understand the context. If you find source code lacking intent-driven comments, apply the **Knowledge Base Enhancement Strategy** to add them *before* implementing your main changes.

### Step 2: Implement Changes

Write or modify code, adhering to project conventions defined in `.github/CODING_GUIDELINES.md`.

### Step 3: Verify

Run tests and other verification tools to confirm your changes are correct.

## 5. The Virtuous Cycle: Enhancing the Knowledge Base

The Implementation Loop creates a virtuous cycle that continuously improves the project's knowledge base:

1. **Query for understanding** (using the Two-Stage Query Protocol).
2. **Read available documentation**.
3. **If source lacks context**: Analyze the code and **add meaningful, intent-driven comments**.
4. **Implement your changes** with the new, deeper understanding.
5. **The knowledge base gets richer**, making the next query more effective.

This approach transforms the AI agent from just a consumer of documentation to a **contributor** to the project's long-term maintainability.

## 6. Session Maintenance

Your initialization is a snapshot in time. The codebase can change. If you pull new changes from the repository, you should consider re-running your initialization steps (reading `Neo.mjs`, and `core/Base.mjs`) to ensure your understanding is up to date.

Furthermore, after pulling changes, the local knowledge base may be out of sync. You should call the `sync_database` tool to re-embed the latest changes into the database.
