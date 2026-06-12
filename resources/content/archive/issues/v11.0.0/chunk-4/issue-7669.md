---
id: 7669
title: 'Refactor: Enhance OpenAPI spec for Knowledge Base Server'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-27T08:50:43Z'
updatedAt: '2025-10-27T08:56:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7669'
author: tobiu
commentsCount: 0
parentIssue: 7668
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-27T08:56:19Z'
---
# Refactor: Enhance OpenAPI spec for Knowledge Base Server

This ticket is part of Epic #7668.

The goal is to update `ai/mcp/server/knowledge-base/openapi.yaml` to make the `query_documents` tool self-documenting. This involves moving detailed usage instructions from `AGENTS.md` into the `description` of the `/documents/query` path and its associated schema.

### Proposed Changes to `openapi.yaml`

#### 1. Expand `/documents/query` Description

Update the `description` for the `POST /documents/query` operation with the following content:

```yaml
description: |
  Performs a semantic search on the knowledge base using a natural language query.
  Returns a scored and ranked list of the most relevant source files.

  ## How to Use This Tool
  
  **Input:**
  - `query`: Natural language search query (1-10 words work best)
  - `type`: Optional filter by content type (all, blog, guide, src, example, ticket, release)
  
  **Output:**
  A ranked list of file paths with relevance scores. Example:
  ```
  Most relevant source files (by weighted score):
  - /path/to/relevant/file1.mjs (Score: 350)
  - /path/to/relevant/file2.md (Score: 210)
  - /path/to/relevant/file3.mjs (Score: 150)
  
  Top result: /path/to/relevant/file1.mjs
  ```
  
  ## How to Interpret Results
  
  1. **Start with the top result**: Always read the highest-scoring file first.
  2. **Scan the next 5-10 results**: Check both file types and scores.
  3. **Balance source and guides**: Read top 1-2 source files (.mjs) AND top 1-2 guides (.md).
     - `.mjs` files: Implementation details, actual code
     - `.md` files: Conceptual context, architectural rationale
  4. **Prioritize content types**:
     - `guide` and `src`: Current best practices and implementation
     - `blog`: Historical context (code examples may be outdated)
     - `example`: Concrete usage patterns
     - `ticket`: Historical decisions and problem-solving context
  
  ## Query Strategies
  
  ### Strategy 1: Broad to Narrow (Discovery Pattern)
  When learning about a new concept:
  1. Start broad: `"benefits"`, `"architecture"`, `"fundamentals"`
  2. Read results from `learn/benefits/` or top-level `.md` files.
  3. Narrow down: `"Button component examples"`, `"afterSet hook"`
  4. Find patterns: `"form validation patterns"`, `"store implementation"`
  
  ### Strategy 2: High-Level Conceptual Questions
  For architectural or "big picture" questions:
  1. Check `learn/tree.json` for content structure.
  2. Use top-level categories: "Benefits", "Fundamentals".
  3. Query using those concepts first.
  4. Drill down into specific implementations.
  
  ### Strategy 3: Targeted Content-Type Searching
  Use the `type` parameter to focus results:
  - Conceptual understanding: `type='guide'`
  - Usage examples: `type='example'`
  - Implementation details: `type='src'`
  - Historical context: `type='ticket'` or `type='blog'`
  
  **Pro tip**: If a broad query returns too many source files and not enough guides, re-run with `type='guide'`. If you need implementation after reading guides, re-run with `type='src'`.
  
  ## When Queries Return No Results
  
  If systematic querying still yields no relevant information, **STOP and document the gap**:
  1. Clearly describe what you were trying to accomplish.
  2. List the queries you attempted.
  3. Explain why existing results were insufficient.
  4. Suggest what type of documentation would help (e.g., a guide, an example, or an architectural explanation).

  ## Handling Failures
  
  If this tool fails or throws an error:
  1. Run the `healthcheck` tool to diagnose the issue.
  2. If unhealthy, consult `.github/AI_QUICK_START.md` for setup guidance.
```

#### 2. Enhance `QueryRequest` Schema

Update the `description` for the properties within the `QueryRequest` schema:

```yaml
QueryRequest:
  type: object
  required:
    - query
  properties:
    query:
      type: string
      description: |
        Natural language search query. Best practices:
        - Keep queries concise (1-10 words)
        - Use specific technical terms when known
        - Start broad, then narrow based on results
        - Example good queries: "Button component", "state management patterns", 
          "afterSet hook implementation", "multi-window architecture"
      example: "How do I use the Tab Container component?"
    type:
      type: string
      description: |
        Filter results by content type:
        - `all`: Search all content (default)
        - `guide`: Conceptual explanations and architectural docs
        - `src`: Source code implementation
        - `example`: Working examples and demos
        - `blog`: Historical context and evolution (code may be outdated)
        - `ticket`: Past issues, decisions, and problem-solving
        - `release`: Release notes and changelogs
      enum: [all, blog, guide, src, example, ticket, release]
      default: all
```

## Timeline

- 2025-10-27T08:50:44Z @tobiu added the `documentation` label
- 2025-10-27T08:50:45Z @tobiu added the `enhancement` label
- 2025-10-27T08:50:45Z @tobiu added the `ai` label
- 2025-10-27T08:50:59Z @tobiu cross-referenced by #7670
- 2025-10-27T08:51:27Z @tobiu assigned to @tobiu
- 2025-10-27T08:51:51Z @tobiu added parent issue #7668
- 2025-10-27T08:55:53Z @tobiu referenced in commit `19de6d7` - "Refactor: Enhance OpenAPI spec for Knowledge Base Server #7669"
- 2025-10-27T08:56:19Z @tobiu closed this issue
- 2025-10-27T09:05:59Z @tobiu cross-referenced by #7672

