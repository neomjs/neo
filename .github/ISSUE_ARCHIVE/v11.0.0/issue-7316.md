---
id: 7316
title: AI Knowledge Evolution
state: CLOSED
labels:
  - enhancement
  - epic
assignees:
  - tobiu
createdAt: '2025-10-01T20:51:13Z'
updatedAt: '2025-10-24T09:53:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7316'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues:
  - '[x] 7317'
  - '[x] 7318'
  - '[x] 7319'
  - '[x] 7320'
  - '[x] 7321'
  - '[x] 7322'
  - '[x] 7324'
  - '[x] 7325'
  - '[x] 7326'
  - '[x] 7332'
  - '[x] 7333'
  - '[x] 7334'
  - '[x] 7335'
  - '[x] 7336'
  - '[x] 7337'
  - '[x] 7338'
  - '[x] 7341'
  - '[x] 7356'
  - '[x] 7357'
  - '[x] 7358'
  - '[x] 7361'
  - '[x] 7362'
  - '[x] 7363'
  - '[x] 7394'
  - '[x] 7397'
  - '[x] 7398'
subIssuesCompleted: 26
subIssuesTotal: 26
blockedBy: []
blocking: []
closedAt: '2025-10-24T09:53:31Z'
---
# AI Knowledge Evolution

This epic outlines the plan to transform the AI agent from a stateless tool into a stateful, learning contributor with full accountability. The primary goal is to create a persistent, queryable memory for the agent that includes not only the "what" (code, docs) but also the "how" (conversations, decisions) and the "why" (internal thought process).

This will enable the agent to debug its own past work, understand the historical context of decisions, and improve its performance over time, making it a true partner in the development lifecycle.

This initiative is a key pillar for advanced workflows, alongside mandatory unit testing and roadmap-driven planning.

## Top-Level Items & Implementation Phases

### Phase 1: The Memory Core - A Unified History Database
- **Goal:** Implement a persistent storage layer for all agent interactions.
- **Technology:** Node.js and ChromaDB.

### Phase 2: The Recall Engine - Integrating Memory into the Workflow
- **Goal:** Enable the agent to query its own memory to inform its actions.

### Phase 3: Personalized Agent Framework
- **Goal:** Establish a framework for contributors to optionally configure a persistent memory and unique Git identity for their local AI agent.

## Comments

### @tobiu - 2025-10-04 12:37

some updates on the current progress:

<img width="1030" height="620" alt="Image" src="https://github.com/user-attachments/assets/1c39c9b8-46d5-4134-bd81-be62dccabe94" />

<img width="928" height="446" alt="Image" src="https://github.com/user-attachments/assets/25af0d83-e784-40d3-97b4-7e102a980603" />

<img width="1026" height="1163" alt="Image" src="https://github.com/user-attachments/assets/1b3c0117-eeb7-4db2-ae32-776fba3a3f7f" />

### @tobiu - 2025-10-24 09:53

closing as resolved.

## Activity Log

- 2025-10-01 @tobiu assigned to @tobiu
- 2025-10-01 @tobiu added the `enhancement` label
- 2025-10-01 @tobiu added sub-issue #7317
- 2025-10-01 @tobiu added sub-issue #7318
- 2025-10-01 @tobiu added sub-issue #7319
- 2025-10-01 @tobiu added sub-issue #7320
- 2025-10-01 @tobiu added sub-issue #7321
- 2025-10-01 @tobiu added the `epic` label
- 2025-10-01 @tobiu added sub-issue #7322
- 2025-10-01 @tobiu referenced in commit `d7db7b0` - "#7316 ticket md files"
- 2025-10-02 @tobiu added sub-issue #7324
- 2025-10-02 @tobiu referenced in commit `e53cf18` - "#7316 new sub md file"
- 2025-10-02 @tobiu added sub-issue #7325
- 2025-10-02 @tobiu referenced in commit `8cc0055` - "#7316 new sub md file"
- 2025-10-02 @tobiu referenced in commit `afe7ee9` - "#7316 mapping custom program versions to process.env.npm_package_version"
- 2025-10-02 @tobiu added sub-issue #7326
- 2025-10-03 @tobiu added sub-issue #7332
- 2025-10-03 @tobiu added sub-issue #7333
- 2025-10-03 @tobiu added sub-issue #7334
- 2025-10-03 @tobiu added sub-issue #7335
- 2025-10-03 @tobiu added sub-issue #7336
- 2025-10-03 @tobiu added sub-issue #7337
- 2025-10-03 @tobiu added sub-issue #7338
- 2025-10-04 @tobiu added sub-issue #7341
- 2025-10-04 @tobiu cross-referenced by #7342
- 2025-10-04 @tobiu cross-referenced by #7343
- 2025-10-04 @tobiu cross-referenced by #7344
- 2025-10-04 @tobiu cross-referenced by #7345
- 2025-10-04 @tobiu cross-referenced by #7346
- 2025-10-04 @tobiu added sub-issue #7356
- 2025-10-04 @tobiu added sub-issue #7357
- 2025-10-04 @tobiu added sub-issue #7358
- 2025-10-05 @tobiu added sub-issue #7361
- 2025-10-05 @tobiu added sub-issue #7362
- 2025-10-05 @tobiu added sub-issue #7363
- 2025-10-06 @tobiu added sub-issue #7394
- 2025-10-07 @tobiu added sub-issue #7397
- 2025-10-07 @tobiu referenced in commit `7bfbcb2` - "#7316 ticket md update"
- 2025-10-07 @tobiu added sub-issue #7398
- 2025-10-24 @tobiu closed this issue

