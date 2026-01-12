---
id: 7964
title: Create ContextAssembler for memory integration
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-01T11:32:03Z'
updatedAt: '2025-12-01T12:12:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7964'
author: tobiu
commentsCount: 1
parentIssue: 7961
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-01T12:12:37Z'
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

## Timeline

- 2025-12-01T11:32:05Z @tobiu added the `enhancement` label
- 2025-12-01T11:32:05Z @tobiu added the `ai` label
- 2025-12-01T11:32:09Z @tobiu added parent issue #7961
- 2025-12-01T11:57:30Z @tobiu assigned to @tobiu
- 2025-12-01T11:58:01Z @tobiu referenced in commit `e9d2d4c` - "Create ContextAssembler for memory integration #7964"
### @tobiu - 2025-12-01T12:12:16Z

**Input from Gemini 2.5:**

> ✦ Implemented `Neo.ai.context.Assembler` using the "Thick Client" pattern.
> - Refactored `Assembler` to use `ai/services.mjs` directly.
> - Updated `KB_QueryService` to self-initialize via `initAsync`.
> - Updated `ai/services.mjs` to export `Memory_SummaryService`.
> - Verified end-to-end RAG injection from both Memory Core and Knowledge Base.

- 2025-12-01T12:12:37Z @tobiu closed this issue

