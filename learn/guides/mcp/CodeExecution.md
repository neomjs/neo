# Code Execution with MCP

The pinnacle of the Agent OS architecture is **Code Execution**, often referred to as the **"Thick Client"** pattern (a term coined by [Anthropic](https://www.anthropic.com/engineering/code-execution-with-mcp)).

This guide explains how to move beyond simple "Tool Use" and empower agents to act as autonomous developers within the Neo.mjs environment.

## The Paradigm Shift

### The Old Way: "Tool Use" (Thin Client)

In a traditional "Tool Use" model, the agent acts as a passive orchestrator, relying on the server for every single step. This creates a chatty, inefficient loop:

1.  **Agent:** "I need to check for bugs."
2.  **Server:** (Executes `list_issues`) -> Returns 50 issues.
3.  **Agent:** "Okay, I see issue #1. Can I see the code for..."
4.  **Server:** (Executes `read_file`) -> Returns file.
5.  **Agent:** "I found a fix. Apply this change."

**The Bottlenecks:**
*   **Latency:** Each step requires a full network round-trip to the LLM.
*   **Cost:** Massive amounts of context tokens are consumed passing intermediate data (like the list of 50 issues) back and forth.
*   **Fragility:** The agent must maintain the entire state of the task in its context window.

### The New Way: "Code Execution" (Thick Client)

In the **Agent OS** model, the agent acts as a **developer**. Instead of asking the server to do things one by one, the agent **writes a script** to perform the entire task autonomously.

The agent imports the **Neo.mjs AI SDK** directly into its script. This SDK exposes all the capabilities of our MCP servers (Knowledge Base, Memory, GitHub) as standard Node.js libraries. The script then runs locally, processing data at machine speed without constant round-trips to the LLM.

**The Advantages:**
*   **Speed:** Data processing happens locally in milliseconds, not seconds.
*   **Efficiency:** Only the final result (or relevant summary) is sent back to the LLM.
*   **Autonomy:** The agent can implement complex logic (loops, filters, retries) that would be difficult to express in a chat interface.

---

## The SDK: `ai/services.mjs`

The heart of this system is the **Neo.mjs AI SDK**. It serves as a bridge, exporting the internal service classes of our MCP servers for direct use in Node.js scripts.

**Import Path:**
```javascript readonly
import { 
    KB_QueryService, 
    GH_IssueService, 
    Memory_Service,
    // ... and more
} from './ai/services.mjs';
```

**Key Services:**

| Domain | Prefix | Description |
| :--- | :--- | :--- |
| **Knowledge Base** | `KB_` | Semantic search (`KB_QueryService`), DB management (`KB_LifecycleService`). |
| **Memory Core** | `Memory_` | Long-term memory (`Memory_Service`), session summaries (`Memory_SessionService`). |
| **GitHub Workflow** | `GH_` | Issue tracking (`GH_IssueService`), PRs (`GH_PullRequestService`). |

*For a complete list of available services and methods, see `ai/sdk-manifest.md`.*

---

## Architecture: Services vs. Servers

It is important to understand that **MCP is just a transport layer**.

In the Neo.mjs Agent OS, the actual business logic (searching vectors, syncing GitHub, saving memories) lives inside **Services** (e.g., `QueryService`, `IssueService`). These are **Neo.mjs Singleton Classes** that exist independently of any server.

*   **The MCP Server** (`mcp-stdio.mjs`) is just a thin wrapper. It exposes these services to the outside world via the Model Context Protocol.
*   **The AI SDK** (`ai/services.mjs`) imports these **Services** directly.

### The `initAsync` Pattern
This decoupled architecture is made possible by the Neo.mjs lifecycle. Services use `initAsync()` to handle their own initialization (connecting to DBs, authenticating APIs) automatically.

When you import a service in a script, it boots itself up. You simply await its readiness:

```javascript readonly
import { KB_QueryService } from './ai/services.mjs';

// Wait for the service to initialize its dependencies (e.g. ChromaDB)
await KB_QueryService.ready();

// Use it directly - no MCP server required.
const result = await KB_QueryService.queryDocuments(...);
```

---

## Runtime Type Safety ("TypeScript without TypeScript")

A major challenge with AI-generated code is ensuring it uses APIs correctly. If an agent hallucinates a method signature, the script crashes.

To solve this, the SDK implements a robust **Runtime Type Safety** layer that acts like a dynamic compiler. It provides **JS-based run-time type safety 1:1 on the same level as MCP server tools**, protecting the system from agent hallucinations.

### How It Works

1.  **OpenAPI as Source of Truth:** Each MCP server defines its capabilities in a strict `openapi.yaml` specification.
2.  **Dynamic Derivation:** Just like the server-side `toolService.mjs` derives tool definitions for the MCP protocol, the SDK dynamically derives method signatures and validation logic from these same specs.
3.  **Zod Validation:** When the SDK loads, it parses the OpenAPI specs and builds **Zod** validation schemas for every method using `ai/mcp/validation/OpenApiValidator.mjs`.
4.  **Interception:** All service method calls are intercepted by a wrapper.
5.  **Validation:** The wrapper validates the arguments against the Zod schema *before* the business logic executes.

### The Result

If an agent writes a script that calls `GH_IssueService.createIssue({ title: 123 })` (passing a number instead of a string), the SDK throws a descriptive error immediately:

```bash readonly
Error: Validation failed
[
  {
    "code": "invalid_type",
    "expected": "string",
    "received": "number",
    "path": [ "title" ],
    "message": "Expected string, received number"
  }
]
```

This precise feedback allows the agent (or developer) to self-correct immediately without needing to debug the internal server logic.

### Example Output: `ai/examples/test-safety.mjs`

```bash readonly
🧪 Testing Runtime Type Safety...

[1] Testing Valid Call...
   ✅ Valid call accepted (promise created)

[2] Testing Invalid Type (query = number)...
   ✅ SUCCESS: Validation Error caught: [
  {
    "code": "invalid_type",
    "expected": "string",
    "received": "number",
    "path": [ "query" ],
    "message": "Expected string, received number"
  }
]

[3] Testing Missing Argument (no query)...
   ✅ SUCCESS: Error caught: {
  "issues": [
    {
      "code": "invalid_type",
      "expected": "string",
      "received": "undefined",
      "path": [ "query" ],
      "message": "Required"
    }
  ],
  "name": "ZodError"
}
```

---

## Example: Smart Search

Before diving into the complex self-healing workflow, let's look at a simpler example: `ai/examples/smart-search.mjs`.
This script demonstrates the core value proposition of "Code Execution": **Logic near Data**.

Instead of:
1.  Agent asks LLM for a query.
2.  LLM returns query.
3.  Agent sends query to server.
4.  Server returns 20 results.
5.  Agent sends 20 results to LLM.
6.  LLM filters top 3.

The script does:
1.  Agent sends query *once*.
2.  Script gets 20 results.
3.  Script logic filters top 3.
4.  Script returns only top 3 to LLM.

### Example Output: `ai/examples/smart-search.mjs`

```bash readonly
🤖 Agent: Initializing Knowledge Base SDK...
⏳ Waiting for Database Lifecycle...
✅ ChromaDB is responding.
🏥 Health Status: healthy
🔍 Querying: "how to use reactive configs"...
✅ Found 25 results.

--- Top Result ---
Source: /Users/Shared/github/neomjs/neo/learn/guides/fundamentals/ConfigSystemDeepDive.md
Score:  5378

--- "Smart" Filter: Top 3 Guides ---
- /Users/Shared/github/neomjs/neo/learn/guides/fundamentals/ConfigSystemDeepDive.md (5378)
- /Users/Shared/github/neomjs/neo/learn/benefits/ConfigSystem.md (4754)
- /Users/Shared/github/neomjs/neo/learn/guides/fundamentals/DeclarativeComponentTreesVsImperativeVdom.md (2811)
```

---

## Workflow Example: The "Self-Healing" Script

The flagship example of this pattern is `ai/examples/self-healing.mjs`. This script demonstrates a fully autonomous workflow where the agent acts as a "repair bot."

### Phase 1: Monitor

The script starts by scanning GitHub for open bugs, filtering for specific labels.

```javascript readonly
// Monitor: Find open bugs
const issues = await GH_IssueService.listIssues({
    state: 'open',
    labels: 'bug',
    limit: 100
});
const targetIssue = issues.issues.find(i => i.title.includes('mobile click'));
```

### Phase 2: Understand

Instead of asking the LLM "how do I fix this?", the script queries the local Knowledge Base for technical context.

```javascript readonly
// Understand: Get context from the codebase
const query = `mobile button click event handler conflict ${targetIssue.body}`;
const docs = await KB_QueryService.queryDocuments({ query, type: 'src' });

console.log(`Context found: ${docs.topResult}`);
```

### Phase 3: Plan

The script persists its reasoning to the Memory Core. This ensures that even if the script crashes or the session ends, the "thought process" is saved.

```javascript readonly
// Plan: Save strategy to long-term memory
await Memory_Service.addMemory({
    prompt: `Fix bug #${targetIssue.number}`,
    thought: "Hypothesis: DomEvent manager double-firing on touch devices.",
    response: "Plan: Propose investigation of DomEvent.mjs delegation logic.",
    sessionId: 'self-healing-bot'
});
```

### Phase 4: Act

Finally, the script takes action in the real world by posting a comment to the GitHub issue.

```javascript readonly
// Act: Post the solution
await GH_IssueService.createComment({
    issue_number: targetIssue.number,
    body: "I have analyzed this issue... Recommendation: Inspect DomEvent.mjs...",
    agent: "Neo Agent OS"
});
```

### Example Output: `ai/examples/self-healing.mjs`

```bash readonly
🤖 Agent OS: Starting Self-Healing Routine...

[1] Boot Sequence: Initializing Services...
   - Knowledge Base Service: Ready
   - Memory Core Service: Ready
✅ System Fully Operational.

[2] Monitor: Scanning for Issues...
   - Found Target: #7834 "[Test] Button click event not firing on mobile"
   - Body: "**Description** This is a test issue created to validate the"...

[3] Understand: Querying Knowledge Base...
   - Analyzed 25 documents.
   - Top Context: /Users/Shared/github/neomjs/neo/learn/guides/userinteraction/events/DomEvents.md (Score: 7387)

[4] Plan: Persisting Strategy to Memory...
   - Strategy saved to long-term memory.

[5] Report: Posting Solution...
✅ Fix proposed on issue #7834.
```

---

## Case Study: Database Schema Evolution

This real-world example illustrates how the "Thick Client" pattern allows the agent to handle complex infrastructure maintenance that would be impossible via standard chat interfaces.

**The Context:**
Feature work in **[Ticket #7862](https://github.com/neomjs/neo/issues/7862)** (adding an `includeAll` parameter to force-summarize ancient sessions) exposed a critical latent bug. The new logic relied on ChromaDB's `$gt` (greater than) operator to filter sessions by time. However, the database contained legacy timestamps stored as **ISO Strings**, while ChromaDB's operators strictly require **Numbers**.

**The Consequence:**
As soon as the new feature was deployed, the Memory Core's query system silently failed. The mismatched types meant the database returned zero results for time-based queries, breaking the session summarization pipeline. *From the user's perspective, summaries simply stopped appearing without error messages.*

**The Autonomous Resolution ([Ticket #7865](https://github.com/neomjs/neo/issues/7865)):**
Instead of asking a human to manually fix the database, the agent leveraged Code Execution to perform a hot-fix migration:

1.  **Diagnosis (`debug_session_state.mjs`):**
    The agent wrote a script to bypass the service layer and inspect the raw ChromaDB collections. It scanned thousands of records, logging the data types, and confirmed that `timestamp` fields were indeed strings, causing the query failures.

    ```javascript readonly
    // Snippet from debug_session_state.mjs
    // The agent accesses the raw collection to verify data integrity
    const memCol = Memory_SessionService.memoryCollection;
    
    const memQuery = {
        include: ['metadatas'],
        limit: 2000
    };
    
    // Direct query to inspect what's actually in the DB
    const batch = await memCol.get(memQuery);
    
    // The agent then iterates through 'batch.metadatas' to check the 'timestamp' type
    // and identifying the mismatch between ISO strings and expected numbers.
    ```

2.  **Remediation (`migrate_timestamps.mjs`):**
    The agent wrote a migration utility to:
    *   Iterate through the entire database (Memories and Summaries).
    *   Detect string-based timestamps.
    *   Parse them into numeric Unix timestamps (`Date.parse()`).
    *   Perform safe batch updates using `collection.update`.

    ```javascript readonly
    // Snippet from migrate_timestamps.mjs
    // Autonomous data migration logic
    for (let i = 0; i < batch.ids.length; i++) {
        const id = batch.ids[i];
        const metadata = batch.metadatas[i];
        const currentTimestamp = metadata.timestamp;

        // Check if migration is needed (is it a string?)
        if (typeof currentTimestamp === 'string') {
            const numericTimestamp = Date.parse(currentTimestamp);
            
            if (!isNaN(numericTimestamp)) {
                // Create updated metadata with numeric timestamp
                const newMetadata = { ...metadata, timestamp: numericTimestamp };
                
                updates.ids.push(id);
                updates.metadatas.push(newMetadata);
            }
        }
    }

    // Perform safe batch update
    if (updates.ids.length > 0) {
        await collection.update({
            ids: updates.ids,
            metadatas: updates.metadatas
        });
        process.stdout.write(`\r   Migrated ${updates.ids.length} records...`);
    }
    ```

3.  **Execution:**
    The agent executed the migration script autonomously. It processed and fixed **2,000+ records in under 3 seconds**, instantly restoring the health of the Memory Core.

**The Takeaway:**
By moving the logic to the code (Thick Client), the agent transformed from a passive user into an active maintainer, capable of diagnosing and patching the very infrastructure it runs on.

**Architectural Lesson:**
This incident demonstrates why the SDK's Runtime Type Safety (Zod validation) only protects against *incorrect argument types*, not *incorrect data in the database*. The agent's ability to write diagnostic scripts filled this gap, allowing it to inspect and repair data integrity issues that validation alone couldn't catch.

---

## When to Use Code Execution

Use the **Thick Client** pattern when:
1.  **The task is repetitive:** e.g., "Check every open PR for missing tests."
2.  **The task involves heavy data processing:** e.g., "Find all components that use this deprecated config." (Doing this in the LLM context window is expensive; doing it in a script is free).
3.  **You need autonomy:** You want to fire-and-forget a task that might take 5 minutes to complete.

Use the **Thin Client** (standard Tool Use) when:
1.  **Exploration:** You are just poking around and don't know what you need yet.
2.  **Simple Q&A:** "How does `Neo.create()` work?"
