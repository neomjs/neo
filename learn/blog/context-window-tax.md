# The Context Window Tax: Efficient Multi-Step AI Workflows via Code Execution

**Abstract**
The Model Context Protocol (MCP) enables AI agents to interact with development tools through a standardized interface. However, the predominant "Tool Use" pattern—where agents call individual tools sequentially and process all results through the Large Language Model—creates a scalability bottleneck we term the **"Context Window Tax"**. This tax manifests as O(n) growth in latency and token consumption for workflows with *n* sequential steps, each requiring data to round-trip through the LLM's context window.

We present the Neo.mjs **Agent OS**, an implementation of the "Code Execution" pattern where agents write and execute local scripts that orchestrate tool calls programmatically. By moving data processing from the LLM to local CPU execution, we demonstrate:
*   **40x reduction** in execution time (120s → 3s) for a 2,000-record database migration
*   **20x reduction** in tool round-trips through batch processing and local filtering
*   **Runtime argument validation** preventing hallucinated API calls without compilation overhead

This work provides a concrete reference implementation of Anthropic's Code Execution vision, demonstrating how a type-validated SDK architecture enables complex autonomous workflows that are infeasible with traditional tool-use patterns.

---

## 1. Introduction

### 1.1 The MCP Ecosystem

The Model Context Protocol, introduced by Anthropic in late 2024, standardized how AI agents connect to external tools and data sources. Early implementations adopted a "Tool Use" pattern where:
1.  The agent receives tool definitions in its context window
2.  It calls tools one at a time via JSON-RPC
3.  Each result is passed back through the LLM for processing
4.  The agent decides the next action based on that result

This pattern works well for simple, single-step tasks ("What's the weather?", "Create a calendar event"). However, for complex workflows involving multiple data sources or iterative processing, this architecture creates significant overhead.

### 1.2 The Context Window Tax

We define the Context Window Tax as the cumulative cost of passing intermediate data through the LLM's context window during multi-step workflows. For a workflow $W$ with $n$ sequential steps:

$$ Cost(W) = \sum_{i=1}^{n} (Context_{prev} + ToolDef_i + Result_i + Reasoning_i) $$

The critical term is $Result_i$, which often contains large, unfiltered datasets (database query results, file contents, API responses) needed only for simple checks or transformations. The LLM must "read" this data token-by-token to extract the relevant information, consuming both time and compute resources.

**Example:** Consider an agent asked to *"Find all database records where the timestamp field is a string instead of a number, and fix them."*

In a **Tool Use** architecture:
1.  **Agent:** `list_records(limit=100, offset=0)`
    *   **Server:** [returns 100 JSON records ≈ 10,000 tokens]
2.  **Agent:** [reads all 10k tokens, identifies 5 string timestamps]
    *   **Agent:** `update_record(id=1, timestamp=converted_value)`
    *   **Server:** [success]
3.  **Agent:** `update_record(id=2, timestamp=converted_value)` ...
4.  **Agent:** `list_records(limit=100, offset=100)`
    *   **Server:** [returns next 100 records ≈ 10,000 tokens]
5.  [repeat until 2,000 records processed]

**Result:** 20+ round-trips, ~500,000 tokens consumed, significant latency.

### 1.3 The Code Execution Alternative

In November 2025, Anthropic published **[Code Execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)**, proposing an alternative pattern where agents write scripts to orchestrate tool calls locally:

> *"Direct tool calls consume context for each definition and result. Agents scale better by writing code to call tools instead."*

Rather than bringing data to the code (the LLM), this pattern sends code to the data. The agent writes a script once, which then executes all tool calls and data processing locally, returning only the final summary.

### 1.4 Our Contribution

We present a production implementation of this pattern through the Neo.mjs Agent OS, demonstrating:
*   **A Type-Validated SDK Architecture:** Tool capabilities exposed as importable JavaScript modules with runtime argument validation via Zod schemas derived from OpenAPI specifications.
*   **Empirical Performance Metrics:** Quantified improvements for real-world tasks including database migrations and multi-service workflow orchestration.
*   **Universal Framework Design:** The backend MCP servers are built using the same Neo.mjs class system that powers browser applications, demonstrating a universal JavaScript architecture that works identically across Node.js and browser environments.

This work serves as a reference implementation for teams building Code Execution systems atop MCP infrastructure.

---

## 2. Architecture

### 2.1 The Hybrid Model

Rather than replacing Tool Use entirely, we implement a hybrid architecture that combines the strengths of both patterns:

```
┌─────────────────────────────────────────────────┐
│              Agent Decision Point               │
└────────────┬────────────────────────┬───────────┘
             │                        │
      Simple Task?             Complex Workflow?
             │                        │
             ▼                        ▼
    ┌────────────────┐      ┌──────────────────┐
    │   Tool Use     │      │ Code Execution   │
    │   (Direct MCP) │      │  (Write Script)  │
    └────────────────┘      └──────────────────┘
             │                        │
             ▼                        ▼
    ┌────────────────┐      ┌──────────────────┐
    │   MCP Server   │      │   Agent OS SDK   │
    │   (Transport)  │      │  (ai/services)   │
    └────────┬───────┘      └────────┬─────────┘
             │                       │
             └───────────┬───────────┘
                         ▼
             ┌───────────────────────┐
             │     Service Layer     │
             │   (Business Logic)    │
             └───────────────────────┘
                         │
          ┌──────────────┴──────────────┐
          ▼              ▼              ▼
      Knowledge        Memory         GitHub
        Base            Core         Workflow
     (ChromaDB)      (ChromaDB)     (API + FS)
    [1 Collection]  [2 Collections]
```

**Design Rationale:**
*   **Tool Use for Simple Tasks:** Atomic operations (query a document, read a file) execute faster with direct MCP calls due to low startup overhead.
*   **Code Execution for Complex Workflows:** Multi-step processes (data migrations, cross-service orchestration) benefit from local execution to eliminate round-trip latency.

This hybrid approach keeps session startup contexts manageable (~115k tokens for our monorepo) while enabling infinite scalability for data-intensive tasks.

### 2.2 The Agent OS SDK

The core of our implementation is `ai/services.mjs`, a standalone JavaScript module that exports the internal service classes powering our three MCP servers:

```javascript
// Agent script import
import { 
    KB_QueryService,      // Knowledge Base: semantic search
    Memory_Service,       // Memory Core: persistent context
    GH_IssueService       // GitHub: project management
} from './ai/services.mjs';

// Services self-initialize via Neo.mjs lifecycle
await KB_QueryService.ready();

// Direct method calls - no MCP transport overhead
const results = await KB_QueryService.queryDocuments({
    query: "reactive config system",
    type: "guide"
});
```

**Key Properties:**
*   **No Build Step Required:** Pure ES modules that run directly in Node.js, preserving our zero-build development philosophy.
*   **Self-Managing Dependencies:** Services use `initAsync()` to handle initialization (database connections, API authentication) automatically. Agents simply await `Service.ready()` before use.
*   **Namespace Prefixes:** Services are organized by domain (`KB_*`, `Memory_*`, `GH_*`).

### 2.3 Runtime Argument Validation

A critical challenge with LLM-generated code is ensuring correct API usage. Agents frequently hallucinate method signatures, invert argument order, or use incorrect types.

Our solution: **Runtime argument validation** via Zod schemas dynamically derived from OpenAPI specifications.

**Implementation:**
1.  Each MCP server defines its API contract in `openapi.yaml`.
2.  At SDK initialization, we parse these specs and generate Zod validation schemas.
3.  All service method calls are intercepted and validated *before* execution.

**Example Error Output (`ai/examples/test-safety.mjs`):**
```javascript
// Agent attempts invalid call
await KB_QueryService.queryDocuments({ query: 123 });

// Runtime validation catches error before execution:
{
  "code": "invalid_type",
  "expected": "string",
  "received": "number",
  "path": ["query"],
  "message": "Expected string, received number"
}
```

This precise feedback enables agents to self-correct immediately without needing to debug internal server logic or database errors.

**Important Distinction:** This is **argument validation**, not full type safety. It protects against hallucinated API calls but cannot guarantee data integrity within external systems (databases, APIs). For those cases, agents write diagnostic scripts to inspect actual data.

### 2.4 Services vs. Servers: Decoupled Architecture

A crucial architectural decision: **MCP servers are just transport adapters.** The actual business logic lives in **Service classes** that exist independently.

```
┌──────────────────────────────────────────┐
│         Service Layer (Core Logic)       │
│  • QueryService (search implementation)  │
│  • SessionService (summary logic)        │
│  • IssueService (GitHub sync)            │
└────────────┬─────────────────────────────┘
             │
   ┌─────────┴──────────┐
   │                    │
   ▼                    ▼
MCP Server          AI SDK
(stdio transport)   (direct import)
```

This decoupling enables testing and reusability without MCP server overhead.

---

## 3. The Three-Dimensional Toolchain

The Agent OS provides three specialized MCP servers, each addressing a distinct dimension of software development:

### 3.1 Dimension 1: Technical Understanding (`neo.mjs-knowledge-base`)

**Role:** Understanding *How* the code works.
The Knowledge Base implements a RAG system using ChromaDB and Google's Gemini embeddings, with a custom scoring algorithm that prioritizes parent classes and source files over documentation.

**Key Feature: Version-Specific Context**
Agents can `git checkout v10.9.0`, trigger `KB_DatabaseService.syncDatabase()`, and have a knowledge base scoped precisely to that version.

### 3.2 Dimension 2: Intent Memory (`neo.mjs-memory-core`)

**Role:** Understanding *Why* decisions were made.
The Memory Core persists not just conversation logs, but the agent's internal reasoning (Prompt, Thought, Response).

**Key Feature: Eventual Consistency**
The system implements drift detection for parallel sessions. If a session crashes, the next agent startup automatically detects the discrepancy and re-summarizes.

### 3.3 Dimension 3: Requirements (`neo.mjs-github-workflow`)

**Role:** Understanding *What* needs to be done.
The GitHub Workflow server maintains a **local, offline-first mirror** of project management data as markdown files (`.github/ISSUE/`).

**Key Feature: Self-Organizing Archive**
Closed issues automatically move into version-specific folders based on release dates.

---

## 4. Case Studies

### 4.1 Pattern: Logic Near Data

**The Baseline Problem:**
Traditional Tool Use forces agents to pass intermediate results through the LLM for simple filtering (e.g., "Find top 3 guides").

**Code Execution Solution (`ai/examples/smart-search.mjs`):**
```javascript
// Agent writes this script once
const results = await KB_QueryService.queryDocuments({
    query: "reactive config system",
    type: "guide",
    limit: 100 // Fetch broad candidate set
});

// Local post-processing (filtering by score threshold)
const top3 = results.results
    .filter(r => r.score > 0.85)
    .slice(0, 3)
    .map(r => `${r.source} (${r.score})`);

return top3;  // Return only the most relevant matches
```
**Benefit:** The agent pays to generate the script once, then all data processing happens at CPU speed.

### 4.2 Autonomous Infrastructure Repair: Quantitative Analysis

**Context:** Feature work in [Issue #7862](https://github.com/neomjs/neo/issues/7862) introduced a schema drift (ISO Strings vs Numbers) in the vector database, causing silent query failures.

**Tool Use Approach (Simulated):**
*   Estimated 40+ round trips (20 pages × 2 ops).
*   ~500k tokens consumed.
*   ~120 seconds execution time.

**Code Execution Solution (Actual):**
The agent autonomously resolved this via a two-phase approach:
1.  **Diagnosis (`debug_session_state.mjs`):** Bypassed the service layer to inspect raw data and confirm string timestamps.
2.  **Remediation (`migrate_timestamps.mjs`):** Wrote a script to iterate the collection in memory, parse timestamps with `Date.parse()`, and execute a batch update.

**Measured Results:**

| Metric | Tool Use (Simulated*) | Code Execution (Actual) | Improvement |
| :--- | :--- | :--- | :--- |
| **Execution Time** | ~120 seconds | 3 seconds | **40x faster** |
| **Database Round-Trips** | 40 | 2 | **20x fewer** |
| **LLM Inference Calls** | 40+ | 2 | **20x fewer** |

*\*Estimated at 3 seconds per turn: 1s network + 2s LLM generation.*

**Architectural Insight:** This demonstrates why **Runtime Argument Validation** is not enough. Zod catches invalid API calls, but cannot detect *data integrity* issues. Only by writing diagnostic code ("Thick Client") could the agent inspect the raw data and fix it.

### 4.3 Multi-Service Orchestration: Bug Triage Workflow

**Task:** Monitor GitHub for bug reports, analyze root causes, and provide structured feedback.

**Script:** `ai/examples/self-healing.mjs`
**Workflow:**
1.  **Monitor:** `GH_IssueService` scans for 'bug' labels.
2.  **Understand:** `KB_QueryService` searches codebase for symptoms.
3.  **Plan:** `Memory_Service` saves hypothesis.
4.  **Act:** `GH_IssueService` posts a structured comment.

**Comparison:**
*   **Tool Use:** ~21k tokens + 6 round-trips.
*   **Code Execution:** ~15k tokens + 1 round-trip.

**Clarification:** This is **Autonomous Bug Triage**, not full self-healing. The agent analyzes and reports but does not create PRs or deploy fixes without human review.

---

## 5. Universal Architecture: Dogfooding Neo.mjs

A unique aspect of this implementation is that the MCP servers themselves are built using the **Neo.mjs framework**—demonstrating a universal JavaScript runtime.

### 5.1 The Neo.mjs Class System in Node.js

```
┌─────────────────────────────────────────────────┐
│         Neo.mjs Universal Runtime               │
├─────────────────────────────────────────────────┤
│                                                 │
│  Browser (App Worker)    │    Node.js (MCP)     │
│  ─────────────────────   │   ───────────────    │
│  • UI Components         │   • Service Classes  │
│  • State Providers       │   • Database Mgmt    │
│  • VDOM Engine           │   • GitHub Sync      │
│                          │                      │
│  Shared Foundation:                             │
│  • Neo.core.Base (inheritance, lifecycle)       │
│  • initAsync() / ready() (dependency injection) │
│  • Reactive Configs (state management)          │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 5.2 Dependency Injection via Async Lifecycle

Neo.mjs solves Node.js initialization ordering with a standardized lifecycle: `mcp-stdio` waits for `SessionService`, which waits for `ChromaManager`, which waits for `DatabaseLifecycleService`. Zero race conditions, zero boilerplate.

### 5.3 Reactive State Management

The same reactive config system that powers UI components manages backend state (e.g., connecting models, handling API key changes).

---

## 6. Evaluation & Discussion

### 6.1 When to Use Each Pattern

| Scenario | Tool Use (Thin Client) | Code Execution (Thick Client) |
| :--- | :--- | :--- |
| **Simple queries** | ✅ Preferred (low latency) | ❌ Overkill |
| **Single-step tasks** | ✅ Preferred (atomic) | ❌ Unnecessary complexity |
| **Data processing** | ❌ Context window bloat | ✅ CPU-speed efficiency |
| **Multi-step workflows** | ❌ Round-trip overhead | ✅ Local orchestration |
| **Exploration** | ✅ Flexible discovery | ❌ Premature optimization |
| **Production** | ❌ Expensive at scale | ✅ Cost-effective |

### 6.2 Limitations

*   **Single-Repo Scope:** Current system cannot orchestrate across multiple repositories.
*   **Human Judgment:** Complex merge conflicts and architectural decisions still require human review.
*   **Safety:** Automated code execution requires sandboxing for production deployment.

---

## 7. Conclusion

The Context Window Tax is a fundamental scalability barrier for Tool Use architectures. As AI agents evolve from simple chatbots to autonomous workflow executors, passing all intermediate data through the LLM becomes untenable.

We have demonstrated that Code Execution patterns—supported by type-validated SDKs and self-managing service architectures—achieve **40x faster execution** for data-intensive tasks and enable complex orchestration that Tool Use cannot support.

This work provides a concrete reference implementation of Anthropic's Code Execution vision, demonstrating the architectural patterns necessary to build production-ready agent systems.

---

**Reproduce our results:**
*   **Repository:** [Neo.mjs on GitHub](https://github.com/neomjs/neo)
*   **Migration Script:** [ai/examples/migrate_timestamps.mjs](https://github.com/neomjs/neo/blob/dev/ai/examples/migrate_timestamps.mjs)
*   **Triage Script:** [ai/examples/self-healing.mjs](https://github.com/neomjs/neo/blob/dev/ai/examples/self-healing.mjs)
