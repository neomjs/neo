---
id: 8319
title: 'MCP: Optimize Neural Link Tool Count'
state: OPEN
labels:
  - ai
  - refactoring
assignees: []
createdAt: '2026-01-04T16:24:21Z'
updatedAt: '2026-01-04T16:24:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8319'
author: tobiu
commentsCount: 0
parentIssue: 8315
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# MCP: Optimize Neural Link Tool Count

Part of Epic #8315.
1. Consolidate `start_ws_server` and `stop_ws_server` into `manage_connection` (action: 'start' | 'stop').
2. Consolidate `get_vdom_tree`, `get_vnode_tree`, and `get_vdom_vnode` into `inspect_component_render_tree` (type: 'vdom' | 'vnode' | 'both').
3. Consolidate `get_neo_config` and `set_neo_config` into `manage_neo_config` (action: 'get' | 'set').

## Activity Log

- 2026-01-04 @tobiu added the `ai` label
- 2026-01-04 @tobiu added the `refactoring` label
- 2026-01-04 @tobiu added parent issue #8315

