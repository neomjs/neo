---
id: 7672
title: 'Refactor: Refine Query Tool Documentation in openapi.yaml'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-27T09:05:58Z'
updatedAt: '2025-10-27T09:14:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7672'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-27T09:14:03Z'
---
# Refactor: Refine Query Tool Documentation in openapi.yaml

This ticket is a follow-up to #7669 and is based on feedback from Sonnet 4.5. The goal is to further refine the documentation for the `query_documents` tool within `ai/mcp/server/knowledge-base/openapi.yaml`.

This ticket covers the following changes:

### 1. Reframe "When Queries Fail" for Collaboration

Update the section on handling empty query results to be more collaborative instead of a hard stop.

**New Text for the `description` of `/documents/query`:**
```yaml
      ## When Queries Return No Results
      
      If queries consistently return no relevant results for your task:

      **Pause and document the gap:**
      - Clearly describe what you were trying to accomplish
      - List the queries you attempted (show your work)
      - Explain why existing results were insufficient
      - Consult with the user about next steps

      **Before implementing based on assumptions:**
      - Explain the knowledge gap you've identified
      - Propose your approach and its basis (general software patterns, analogous Neo.mjs patterns, etc.)
      - Get explicit user approval to proceed
```

### 2. Consolidate Query Strategies

Refactor the query strategies into a single, more concise "Discovery Pattern".

**New Text for the `description` of `/documents/query`:**
```yaml
      ## Query Strategies

      ### The Discovery Pattern: Broad to Narrow
      When learning about a new concept or feature area:

      1.  **Start Broad:** Query foundational concepts first.
          - For high-level questions, consult `learn/tree.json` to identify key concepts.
          - Use terms like `"benefits"`, `"architecture"`, `"fundamentals"`.
          - Prioritize reading guides from top-level directories.

      2.  **Narrow to Specifics:** Use broad results to formulate targeted queries.
          - `query_documents(query='Button component examples')`
          - `query_documents(query='what is Neo.component.Base?')`

      3.  **Filter by Type:** Use the `type` parameter for focused results.
          - Conceptual: `type='guide'`
          - Usage examples: `type='example'`
          - Implementation: `type='src'`
```

### 3. Remove Redundant "Do NOT" List

The `Do NOT` list at the end of the "When Queries Fail" section is redundant with the Anti-Hallucination Policy and should be removed from the `openapi.yaml` description.


## Timeline

- 2025-10-27T09:05:59Z @tobiu added the `documentation` label
- 2025-10-27T09:05:59Z @tobiu added the `enhancement` label
- 2025-10-27T09:06:00Z @tobiu added the `ai` label
- 2025-10-27T09:06:49Z @tobiu assigned to @tobiu
- 2025-10-27T09:13:46Z @tobiu referenced in commit `599c2fc` - "Refactor: Refine Query Tool Documentation in openapi.yaml #7672"
- 2025-10-27T09:14:04Z @tobiu closed this issue

