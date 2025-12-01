---
id: 7964
title: Create ContextAssembler for memory integration
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-12-01T11:32:03Z'
updatedAt: '2025-12-01T11:32:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7964'
author: tobiu
commentsCount: 0
parentIssue: 7961
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Create ContextAssembler for memory integration

**Goal:** Create the mechanism to assemble the full context for the LLM.
**Scope:**
- Implement `Neo.ai.context.Assembler`.
- Logic to combine:
    - System Prompt (Identity & Rules).
    - Short-Term Memory (Current Session History via `memory-core`).
    - Long-Term Memory (RAG results via `memory-core` or `knowledge-base`).
    - Current Event (The trigger).
- Implement token counting estimation to ensure the payload fits the model's window.
**Context:** Part of Epic #7961.

## Activity Log

- 2025-12-01 @tobiu added the `enhancement` label
- 2025-12-01 @tobiu added the `ai` label
- 2025-12-01 @tobiu added parent issue #7961

