---
id: 8923
title: 'Refactor: Optimize Neural Link get_component_tree for token efficiency'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-01-31T15:01:13Z'
updatedAt: '2026-01-31T16:22:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8923'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-31T16:22:16Z'
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
- 2026-01-31T16:12:13Z @tobiu assigned to @tobiu
- 2026-01-31T16:20:52Z @tobiu referenced in commit `c1be3ba` - "refactor: Optimize Neural Link get_component_tree for token efficiency (#8923)

Added a 'lean' mode (default: true) to GetComponentTreeRequest. In lean mode, the component service now returns a strictly whitelisted subset of properties (id, className, items) to significantly reduce payload size and token consumption for AI agents. Removed ntype and parentId from the lean output as they are redundant."
### @tobiu - 2026-01-31T16:21:16Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the 'lean' mode for `get_component_tree`.
> 
> **Changes:**
> 1.  **Strict Whitelisting:** In `lean` mode (which defaults to `true`), the serialization now *only* includes:
>     - `id`
>     - `className`
>     - `items` (recursive)
> 2.  **Removal of Redundancy:** I removed `ntype` and `parentId` from the lean output as discussed, as they are either redundant (implied by hierarchy) or can be derived from `className`.
> 3.  **Schema Update:** Updated `openapi.yaml` to include the `lean` parameter definition and description.
> 
> This should drastically reduce the token count for component tree inspections.

- 2026-01-31T16:22:16Z @tobiu closed this issue

