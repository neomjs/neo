---
id: 8327
title: '[Neural Link] Feature: Tool find_instances'
state: OPEN
labels:
  - developer-experience
  - ai
  - feature
assignees: []
createdAt: '2026-01-04T19:47:47Z'
updatedAt: '2026-01-04T19:47:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8327'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# [Neural Link] Feature: Tool find_instances

Proposed by Gemini 3 Pro.

**Goal:**
Enable discovery of non-component instances (StateProviders, Stores, Managers) by properties or class name.

**New Tool: `find_instances`**
- **Service:** `InstanceService`
- **Logic:** Delegates to `Neo.manager.Instance.find()`.
- **Params:** `selector` (Object) - e.g., `{ className: 'Neo.state.Provider' }`.
- **Returns:** List of matching instance summaries (id, className).

**Use Case:**
"List all active State Providers" -> `find_instances({ className: 'Neo.state.Provider' })`.

## Activity Log

- 2026-01-04 @tobiu added the `developer-experience` label
- 2026-01-04 @tobiu added the `ai` label
- 2026-01-04 @tobiu added the `feature` label
- 2026-01-04 @tobiu added parent issue #8169
- 2026-01-04 @tobiu cross-referenced by #8326

