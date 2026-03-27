---
id: 9545
title: Fix Knowledge Base Tool Argument Routing (x-pass-as-object)
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-03-24T19:59:33Z'
updatedAt: '2026-03-24T20:00:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9545'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-24T20:00:27Z'
---
# Fix Knowledge Base Tool Argument Routing (x-pass-as-object)

### Goal
Fix a routing bug in the `neo.mjs-knowledge-base` MCP server that prevented the `manage_knowledge_base` and `manage_database` tools from receiving their arguments correctly when called via the internal Node.js SDK (`ai/services.mjs`).

### Context
During an attempt to trigger a knowledge base sync, the `manage_knowledge_base` tool threw an error: `Invalid action: undefined`. 
Investigation revealed that `ai/services.mjs` uses `OpenApiValidator.mjs` and the `openapi.yaml` spec to dynamically generate Zod schemas and validate/route arguments to the underlying service methods.

If an OpenAPI endpoint lacks the `x-pass-as-object: true` annotation, the SDK attempts to map the JSON request body properties to positional arguments based on a heuristic, which fails for complex service methods that expect a single destructured config object (e.g., `manageKnowledgeBase({action})`). 

The `query_documents` tool had this annotation, but the newer `manage_database` and `manage_knowledge_base` tools introduced in Epic #8315 were missing it.

### Acceptance Criteria
- Add `x-pass-as-object: true` to the `/db/manage` (`manage_database`) path in `ai/mcp/server/knowledge-base/openapi.yaml`.
- Add `x-pass-as-object: true` to the `/db/data/manage` (`manage_knowledge_base`) path in the same file.
- Verify that calling these tools via the SDK correctly passes the arguments as an object.

## Timeline

- 2026-03-24T19:59:34Z @tobiu added the `bug` label
- 2026-03-24T19:59:35Z @tobiu added the `ai` label
- 2026-03-24T20:00:03Z @tobiu referenced in commit `ca3b26e` - "fix(ai): add x-pass-as-object to manage tools in KB openapi spec (#9545)

- Added missing 'x-pass-as-object: true' annotation to manage_database and manage_knowledge_base in openapi.yaml.
- This ensures ai/services.mjs routes arguments as a destructured object instead of positional arguments, fixing the 'Invalid action: undefined' error when invoking these tools."
- 2026-03-24T20:00:13Z @tobiu assigned to @tobiu
- 2026-03-24T20:00:28Z @tobiu closed this issue

