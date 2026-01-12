---
id: 8317
title: 'MCP: Optimize Knowledge Base Tool Count'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-04T16:24:17Z'
updatedAt: '2026-01-04T16:38:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8317'
author: tobiu
commentsCount: 1
parentIssue: 8315
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-04T16:38:32Z'
---
# MCP: Optimize Knowledge Base Tool Count

Part of Epic #8315.
1. Consolidate `start_database` and `stop_database` into `manage_database` (action: 'start' | 'stop').
2. Consolidate `create_knowledge_base`, `embed_knowledge_base`, `sync_database`, and `delete_database` into `manage_knowledge_base` (action: 'create' | 'embed' | 'sync' | 'delete').

## Timeline

- 2026-01-04T16:24:18Z @tobiu added the `ai` label
- 2026-01-04T16:24:18Z @tobiu added the `refactoring` label
- 2026-01-04T16:24:35Z @tobiu added parent issue #8315
- 2026-01-04T16:31:24Z @tobiu cross-referenced by #8316
### @tobiu - 2026-01-04T16:38:21Z

**Input from Gemini:**

> ✦ I have successfully refactored the Knowledge Base MCP server to consolidate redundant tools.
> 
> **Changes:**
> 1.  **Unified Database Lifecycle:** Consolidated `start_database` and `stop_database` into `manage_database` (Action: `start` | `stop`).
> 2.  **Unified Knowledge Base Management:** Consolidated `sync_database`, `create_knowledge_base`, `embed_knowledge_base`, and `delete_database` into `manage_knowledge_base` (Action: `sync` | `create` | `embed` | `delete`).
> 3.  **Modified `openapi.yaml`:** Updated paths to `/db/manage` and `/db/data/manage`.
> 4.  **Updated Services:** Added `manageDatabase` to `DatabaseLifecycleService` and `manageKnowledgeBase` to `DatabaseService`.
> 5.  **Updated `toolService.mjs`:** Updated service mappings to reflect the new unified tools.
> 
> This reduces the Knowledge Base tool count by 4.
> 
> **Next Steps:**
> Proceed with GitHub Workflow tool optimization (#8318).

- 2026-01-04T16:38:27Z @tobiu assigned to @tobiu
- 2026-01-04T16:38:32Z @tobiu closed this issue
- 2026-01-04T16:40:10Z @tobiu referenced in commit `8982b75` - "Refactor Knowledge Base MCP tools to use unified 'manage_database' and 'manage_knowledge_base' commands (#8317)"

