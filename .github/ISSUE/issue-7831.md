---
id: 7831
title: 'Exploration: Enable AI Agent Code Execution with Standalone AI SDK'
state: OPEN
labels:
  - enhancement
  - developer-experience
  - ai
assignees: []
createdAt: '2025-11-21T00:37:14Z'
updatedAt: '2025-11-21T00:37:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7831'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Exploration: Enable AI Agent Code Execution with Standalone AI SDK

**Objective**
Explore and validate the "Code Execution" pattern for AI agents within the Neo.mjs ecosystem. This involves decoupling the existing AI Knowledge Base services from the MCP server transport, allowing them to be imported and used directly as a standalone Node.js SDK.

**Context**
Anthropic's "Code Execution" pattern demonstrates that agents are more efficient when they can write scripts to interact with tools rather than making multiple chatty API calls. Neo.mjs, being Node.js compatible, is uniquely positioned to offer this via its intelligent services (Knowledge Base, Memory, etc.).

**Tasks**
1.  **Refactor Services:** Extract `DatabaseService`, `QueryService`, etc., from the `mcp-stdio.mjs` coupling into a clean, re-exportable module (`ai/services.mjs`).
2.  **Create Proof of Concept:** Implement a demo script (`ai/examples/smart-search.mjs`) that imports these services to perform a "smart" query (health check -> query -> client-side filtering) in a single execution block.
3.  **Validate Lifecycle:** Ensure the `initAsync` / `ready()` pattern works correctly for these decoupled services.

**Deliverables**
- `ai/services.mjs`: The entry point for the AI SDK.
- `ai/examples/smart-search.mjs`: A working example script.
- `ROADMAP_AI_AGENTS.md`: Strategic roadmap for future "Agent OS" features.


## Activity Log

- 2025-11-21 @tobiu added the `enhancement` label
- 2025-11-21 @tobiu added the `developer-experience` label
- 2025-11-21 @tobiu added the `ai` label

