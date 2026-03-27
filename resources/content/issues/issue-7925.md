---
id: 7925
title: 'Feat: Create VisualService (Sighted Agent SDK)'
state: CLOSED
labels:
  - enhancement
  - stale
  - ai
assignees: []
createdAt: '2025-11-29T15:20:04Z'
updatedAt: '2026-03-14T03:37:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7925'
author: tobiu
commentsCount: 2
parentIssue: 7919
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-14T03:37:16Z'
---
# Feat: Create VisualService (Sighted Agent SDK)

## Context
We want to evolve the "Sighted Agent" concept into a first-class citizen of our AI SDK.

## Requirements
1.  **Class:** Create `ai/services/Visual.mjs`.
2.  **Capabilities:**
    *   `captureScreenshot(selector)`: Uses Chrome DevTools Protocol.
    *   `getAccessibilityTree()`: Returns the semantic tree for LLM analysis.
    *   `highlightElement(selector)`: Visually tags an element for debugging.
3.  **Integration:** Ensure this service can be imported by `Neo.ai.Agent`.

## Output
*   A new service in the AI SDK.


## Timeline

- 2025-11-29T15:20:05Z @tobiu added the `enhancement` label
- 2025-11-29T15:20:05Z @tobiu added the `ai` label
- 2025-11-29T15:22:23Z @tobiu added parent issue #7919
### @github-actions - 2026-02-28T03:22:04Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-02-28T03:22:05Z @github-actions added the `stale` label
### @github-actions - 2026-03-14T03:37:16Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2026-03-14T03:37:16Z @github-actions closed this issue

