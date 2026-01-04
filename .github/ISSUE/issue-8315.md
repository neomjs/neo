---
id: 8315
title: Optimization of MCP Tool Count to Respect VSCode Extension Limits
state: OPEN
labels:
  - enhancement
  - epic
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-04T16:23:49Z'
updatedAt: '2026-01-04T17:18:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8315'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[x] 8316 MCP: Optimize Memory Core Tool Count'
  - '[x] 8317 MCP: Optimize Knowledge Base Tool Count'
  - '[x] 8318 MCP: Optimize GitHub Workflow Tool Count'
  - '[x] 8319 MCP: Optimize Neural Link Tool Count'
  - '[ ] 8320 MCP: Optimize Memory Core Database Backup Tools'
subIssuesCompleted: 4
subIssuesTotal: 5
blockedBy: []
blocking: []
---
# Optimization of MCP Tool Count to Respect VSCode Extension Limits

**Problem:**
VSCode extensions like "Google Antigravity" impose a hard limit on the total number of tools an MCP server (or collection of servers) can expose. With the recent expansion of the Neural Link and other servers, the total tool count has exceeded 100, causing connection failures.

**Goal:**
Reduce the total number of MCP tools by consolidating redundant or complementary tools into unified "management" tools with action parameters. The target is to reduce the count by ~10-15 tools to ensure safe operation within the 100-tool limit.

**Scope:**
1.  **Memory Core:** Consolidate database lifecycle tools.
2.  **Knowledge Base:** Consolidate database lifecycle and synchronization tools.
3.  **GitHub Workflow:** Consolidate issue, label, and comment management tools.
4.  **Neural Link:** Consolidate connection management, config management, and component inspection tools.

**Proposed Consolidations:**
-   `start_database` / `stop_database` -> `manage_database` (Memory & KB)
-   `assign_issue` / `unassign_issue` -> `manage_issue_assignees`
-   `add_labels` / `remove_labels` -> `manage_issue_labels`
-   `create_comment` / `update_comment` -> `manage_comment`
-   `start_ws_server` / `stop_ws_server` -> `manage_connection`
-   `get_vdom_tree` / `get_vnode_tree` / `get_vdom_vnode` -> `inspect_component_render_tree`
-   `get_neo_config` / `set_neo_config` -> `manage_neo_config`

## Activity Log

- 2026-01-04 @tobiu added the `enhancement` label
- 2026-01-04 @tobiu added the `epic` label
- 2026-01-04 @tobiu added the `ai` label
- 2026-01-04 @tobiu added the `refactoring` label
- 2026-01-04 @tobiu cross-referenced by #8316
- 2026-01-04 @tobiu cross-referenced by #8317
- 2026-01-04 @tobiu cross-referenced by #8318
- 2026-01-04 @tobiu cross-referenced by #8319
- 2026-01-04 @tobiu added sub-issue #8316
- 2026-01-04 @tobiu added sub-issue #8317
- 2026-01-04 @tobiu added sub-issue #8318
- 2026-01-04 @tobiu added sub-issue #8319
- 2026-01-04 @tobiu assigned to @tobiu
- 2026-01-04 @tobiu cross-referenced by #8320
- 2026-01-04 @tobiu added sub-issue #8320

