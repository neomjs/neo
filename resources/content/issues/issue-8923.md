---
id: 8923
title: 'Refactor: Optimize Neural Link get_component_tree for token efficiency'
state: OPEN
labels:
  - enhancement
  - ai
  - performance
assignees: []
createdAt: '2026-01-31T15:01:13Z'
updatedAt: '2026-01-31T15:01:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8923'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Refactor: Optimize Neural Link get_component_tree for token efficiency

The `get_component_tree` tool currently returns full component serialization (including VDOM, VNode, listeners) for every node in the hierarchy, resulting in massive payloads (1M+ tokens) for complex apps.

**Goals:**
1.  Introduce a `lean` mode (default: true) to `ComponentService.getComponentTree`.
2.  **Strict Whitelisting:** In lean mode, return *only* the following properties: `id`, `className`, `ntype`, `parentId`, `items`.
3.  Ensure the recursion logic respects this whitelist, preventing any other configs (like `vdom`, `vnode`, `listeners`, `theme`, `style`) from leaking into the output.

**Impact:**
Reduce payload size by ~95%, enabling agents to inspect large application trees without exhausting context windows.

## Timeline

- 2026-01-31T15:01:14Z @tobiu added the `enhancement` label
- 2026-01-31T15:01:14Z @tobiu added the `ai` label
- 2026-01-31T15:01:14Z @tobiu added the `performance` label

