---
id: 8328
title: '[Neural Link] Feature: Tool query_vdom'
state: OPEN
labels:
  - developer-experience
  - ai
  - feature
assignees:
  - tobiu
createdAt: '2026-01-04T19:47:50Z'
updatedAt: '2026-01-05T11:32:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8328'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# [Neural Link] Feature: Tool query_vdom

Proposed by Gemini 3 Pro.

**Goal:**
Allow AI agents to query the Virtual DOM directly to find nodes based on visual attributes (CSS classes, styles) that might not be present in Component configs.

**New Tool: `query_vdom`**
- **Service:** `ComponentService`
- **Logic:** Uses `Neo.util.VDom.find()`.
- **Params:**
    - `rootId` (String, optional): Component ID to start search from.
    - `selector` (Object): VDOM selector (e.g., `{ cls: 'my-class' }` or `{ id: 'my-node' }`).
- **Returns:** The matching VDOM node(s).

**Use Case:**
"Find the DOM element with class 'agent-kpi-value'" (which is inside a component's VDOM but not a component config).

## Activity Log

- 2026-01-04 @tobiu added the `developer-experience` label
- 2026-01-04 @tobiu added the `ai` label
- 2026-01-04 @tobiu added the `feature` label
- 2026-01-04 @tobiu added parent issue #8169
- 2026-01-05 @tobiu assigned to @tobiu

