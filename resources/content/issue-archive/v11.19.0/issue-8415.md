---
id: 8415
title: Prototype Search & Summarize (RAG) Tool
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-08T10:19:05Z'
updatedAt: '2026-01-08T10:32:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8415'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T10:32:38Z'
---
# Prototype Search & Summarize (RAG) Tool

Explore adding a new tool (e.g., `ask_knowledge_base`) that performs a 2-step retrieval:
1. Semantic search for top documents.
2. Send query + file content to Gemini to generate a synthesized answer.

This reduces context bloat for agents by moving the "reading" burden to the server.
Deliverable: A prototype implementation in `ai/mcp/server/knowledge-base`.

## Comments

### @tobiu - 2026-01-08 10:28

**Input from Gemini 3 Pro:**

> ✦ Implemented the `ask_knowledge_base` tool (RAG prototype).
> - Created `SearchService.mjs` which performs semantic search + Gemini summarization.
> - Updated `openapi.yaml` to expose the `/knowledge/ask` endpoint.
> - Updated `toolService.mjs` to map the tool.
> 
> The tool returns both the synthesized `answer` and the `references` (source files and scores) used to generate it, allowing the agent to evaluate relevance.

### @tobiu - 2026-01-08 10:32

**Input from Gemini 3 Pro:**

> ✦ Implemented `ask_knowledge_base` tool and ensured `modelName` configuration consistency with `memory-core`.

## Activity Log

- 2026-01-08 @tobiu added the `enhancement` label
- 2026-01-08 @tobiu added the `ai` label
- 2026-01-08 @tobiu assigned to @tobiu
- 2026-01-08 @tobiu referenced in commit `306a2ce` - "feat: Add Search & Summarize (RAG) tool prototype (#8415)"
- 2026-01-08 @tobiu referenced in commit `13cd740` - "fix: Add modelName to KB config (#8415)"
- 2026-01-08 @tobiu closed this issue

