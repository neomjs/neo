# Code Execution with MCP

The pinnacle of the Agent OS architecture is **Code Execution**, often referred to as the **"Thick Client"** pattern.

## The "Tool Use" Bottleneck

In a standard "Tool Use" (Thin Client) model, an agent is a passive chatbot.
1.  **Agent:** "I need to check for bugs."
2.  **Server:** (Executes `list_issues`) -> Returns 50 issues.
3.  **Agent:** "Okay, I see issue #1. Can I see the code for..."
4.  **Server:** (Executes `read_file`) -> Returns file.
5.  **Agent:** "I found a fix. Apply this change."

This is slow, chatty, and consumes massive amounts of context tokens.

## The "Thick Client" Pattern (Agent OS)

In the Agent OS model, the agent acts as a developer. Instead of asking the server to do things one by one, the agent **writes a script** to perform the entire task autonomously.

It does this by importing the **AI SDK** (`ai/services.mjs`), which exposes all the capabilities of the MCP servers as a standard Node.js library.

### The SDK: `ai/services.mjs`

This file is the bridge. It exports the internal service classes of our MCP servers for direct use:

```javascript
import { 
    KB_QueryService, 
    GH_IssueService, 
    Memory_Service 
} from './ai/services.mjs';
```

### Runtime Type Safety ("TypeScript without TypeScript")

A major challenge with AI-generated code is ensuring it uses APIs correctly. The SDK solves this by implementing **Runtime Type Safety**.
It parses the `openapi.yaml` specifications of our servers at runtime and wraps every service method with **Zod** validation schemas.

If an agent writes a script that calls `GH_IssueService.createIssue({ title: 123 })` (passing a number instead of a string), the SDK will throw a clear, descriptive error immediately, before the request even hits the logic. This allows the agent to self-correct without crashing the system.

## Example: The Self-Healing Workflow

The flagship example of this pattern is `ai/examples/self-healing.mjs`. In this script, an agent:

1.  **Monitors:** Uses `GH_IssueService` to find open bugs.
2.  **Understands:** Uses `KB_QueryService` to search the codebase for relevant context.
3.  **Plans:** Uses `Memory_Service` to save its reasoning strategy.
4.  **Acts:** Uses `GH_IssueService` to post a comment with a proposed fix.

The agent writes this logic *once*, and then executes it. This turns a multi-turn conversation into a single, autonomous action.

## How to Use It

To leverage code execution:
1.  **Import the SDK:** `import { ... } from './ai/services.mjs'`
2.  **Initialize Services:** Call `await ServiceName.ready()` (e.g., `KB_ChromaManager.ready()`) to ensure connections are active.
3.  **Execute Logic:** Write your standard Node.js logic using the services.

This transforms the Neo.mjs repository from a static codebase into a dynamic, programmable environment where agents can work alongside you as true peers.
