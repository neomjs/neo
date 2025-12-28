---
id: 8186
title: 'Feat: Neural Link - Semantic Component Query'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-12-28T21:06:28Z'
updatedAt: '2025-12-28T21:06:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8186'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: Neural Link - Semantic Component Query

**Context:**
Finding components by exact ID is brittle. Agents need to query components by properties. `Neo.manager.Component` already provides robust querying capabilities.

**Scope:**

1.  **Enhance `ComponentService`:**
    -   Add `queryComponent(sessionId, selector, options)`.
    -   `selector`: JSON Object (e.g. `{ntype: 'button', text: 'Save'}`).
    -   `rootId`: Optional ID to scope the search (uses `component.down()`).
    -   If no `rootId`, searches globally.

2.  **Tools:**
    -   `query_component`: Accepts `selector` and optional `rootId`. Returns an array of matching component IDs with basic metadata (id, className, ntype).

**Goal:** Enable "fuzzy" component discovery using existing framework capabilities.

## Activity Log

- 2025-12-28 @tobiu added the `enhancement` label
- 2025-12-28 @tobiu added the `ai` label
- 2025-12-28 @tobiu added parent issue #8169

