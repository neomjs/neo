# Neo.mjs AI Agent & Code Execution Roadmap

## Vision: The "Thick Client" for AI Agents
Position Neo.mjs not just as a frontend framework, but as the **Operating System for AI Agents**. By leveraging our Node.js compatibility, robust class system, and "batteries included" architecture, we can provide the structured "brain" (Context Engineering) that powers Anthropic's "Code Execution" pattern.

## 1. Architectural Enhancements (Code Execution Readiness)

### 1.1 Decouple Services from MCP Transport
**Goal:** Allow agents to import and use our intelligent services directly as libraries, without the MCP protocol overhead.
- **Current State:** Services like `QueryService` are coupled to the `mcp-stdio.mjs` entry point implicitly via the server structure.
- **Action:** Refactor `ai/mcp/server/*/services/*.mjs` to be importable as a standalone "AI SDK".
- **Benefit:** Enables the "Code Execution" pattern where an agent writes a script to `import { QueryService }` and uses it directly.

### 1.2 Standardize the `initAsync` / `ready()` Pattern
**Goal:** Provide a predictable lifecycle for all AI services.
- **Current State:** `DatabaseService` uses `initAsync`, but it needs to be a codified standard across all agent-facing services.
- **Action:** Implement a `Neo.ai.ServiceBase` class that enforces the `initAsync()` and `ready()` pattern, enabling agents to write generic "wait for readiness" logic.

### 1.3 The "Neo Sandbox" Environment
**Goal:** Define a standard environment for agents to execute Neo.mjs code.
- **Action:** Create a lightweight boilerplate/config that sets up the Neo.mjs core in a Node.js script (handling `globalThis`, `Worker` mocks if needed) so agents can instantly start scripting.

## 2. New "Code Execution" Capabilities

### 2.1 "Smart" Search Scripts
**Concept:** Instead of just returning search results to the LLM, the agent writes a script to refine them.
**Example Script:**
```javascript
import { QueryService, DocumentService } from '@neomjs/ai';

await QueryService.ready();

// 1. Broad Search
const results = await QueryService.queryDocuments({ query: 'grid filtering', limit: 50 });

// 2. logic-based filtering (Agent logic running in sandbox)
const specificContext = results.filter(r => 
    r.metadata.type === 'src' && r.content.includes('filterBy')
);

// 3. Return only high-value tokens
console.log(JSON.stringify(specificContext));
```

### 2.2 Automated Refactoring Agents
**Concept:** Agents that don't just suggest code, but verify it using the runtime.
**Action:** Expose the `Neo.mjs` core (Component system, Config system) to the agent sandbox. An agent could instantiate a component in Node.js, verify its config validity using `Neo.create()`, and *then* commit the code.

## 3. Visibility & Marketing ("Get Visibility")

### 3.1 "Context Engineering" Case Study
**Action:** Publish a technical blog post titled: *"Context Engineering: How we reduced LLM token usage by 90% using Neo.mjs Class Hierarchies"*.
- Contrast raw file dumping (Context Tax) vs. our semantic inheritance chain injection.

### 3.2 "The Agent OS" Branding
**Action:** Update `README.md` and website to explicitly mention "AI-Native" capabilities.
- "The only framework with a built-in Semantic Knowledge Base."
- "Architecture designed for Agent Code Execution."

### 3.3 Example: The "Self-Healing" Repository
**Action:** Create a demo where an agent uses `GitHubWorkflow` + `KnowledgeBase` to:
1. Read a bug report.
2. Query the KB for the relevant class.
3. Write a reproduction test case (using Neo.mjs test runner).
4. Fix the bug.
5. Verify the fix.
All without human intervention, leveraging the "Code Execution" loop.

## 4. Immediate Next Steps

1.  **Refactor:** Extract `ai/mcp/server/knowledge-base/services` into a re-exportable module structure.
2.  **Demo:** Create a `examples/agent-scripts/` directory containing a reference "Code Execution" script that imports `Neo` and uses the `QueryService` directly.
3.  **Document:** Add `ai/README.md` explaining how to use the AI infrastructure programmatically.