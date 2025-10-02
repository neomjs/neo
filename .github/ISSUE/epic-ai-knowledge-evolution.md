# Epic: AI Knowledge Evolution

GH ticket id: #7316

**Assignee:** tobiu
**Status:** To Do

## Scope

This epic outlines the plan to transform the AI agent from a stateless tool into a stateful, learning contributor with full accountability. The primary goal is to create a persistent, queryable memory for the agent that includes not only the "what" (code, docs) but also the "how" (conversations, decisions) and the "why" (internal thought process).

This will enable the agent to debug its own past work, understand the historical context of decisions, and improve its performance over time, making it a true partner in the development lifecycle.

This initiative is a key pillar for advanced workflows, alongside mandatory unit testing and roadmap-driven planning.

## Top-Level Items & Implementation Phases

### Phase 1: The Memory Core - A Unified History Database
- **Goal:** Implement a persistent storage layer for all agent interactions.
- **Technology:** Node.js and ChromaDB.

### Phase 2: The Recall Engine - Integrating Memory into the Workflow
- **Goal:** Enable the agent to query its own memory to inform its actions.

### Phase 3: Personalized Agent Framework
- **Goal:** Establish a framework for contributors to optionally configure a persistent memory and unique Git identity for their local AI agent.

## Sub-Tasks

### Phase 1: The Memory Core
- **Done:** ticket-refactor-ai-configuration.md
- **Done:** ticket-setup-memory-chromadb.md
- **Done:** ticket-create-memory-capture-api.md
- **Done:** ticket-implement-memory-backup-and-restore.md

### Phase 2: The Recall Engine
- **Done:** ticket-create-memory-query-tool.md
- **To Do:** ticket-create-session-summarization-api.md
- **To Do:** ticket-update-agent-workflow-for-memory.md

### Phase 3: Personalized Agent Framework
- **To Do:** ticket-define-agent-git-identity-workflow.md
