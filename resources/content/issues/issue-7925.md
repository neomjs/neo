---
id: 7925
title: 'Feat: Create VisualService (Sighted Agent SDK)'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-11-29T15:20:04Z'
updatedAt: '2025-11-29T22:14:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7925'
author: tobiu
commentsCount: 0
parentIssue: 7919
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

