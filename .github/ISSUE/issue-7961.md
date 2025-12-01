---
id: 7961
title: 'Epic: Agent Cognitive Runtime'
state: OPEN
labels:
  - epic
  - ai
  - architecture
assignees: []
createdAt: '2025-12-01T10:21:58Z'
updatedAt: '2025-12-01T10:21:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7961'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Epic: Agent Cognitive Runtime

**Goal:** Transform `Neo.ai.Agent` from a passive tool wrapper into an autonomous daemon with perception, reasoning, and action capabilities.

**Scope:**
1.  **Model Abstraction Layer:**
    *   `Neo.ai.model.Base`: Abstract base class for LLM providers.
    *   `Neo.ai.model.Gemini`: Concrete implementation for Google Gemini API.
    *   Interface methods: `infer()`, `stream()`.
2.  **Context Window Management:**
    *   Mechanism to maintain conversation history.
    *   Strategies for token limit management (FIFO, summarization).
3.  **Event Queue & Loop:**
    *   `PriorityQueue` for handling incoming signals (System vs User vs Telemetry).
    *   The "Stimulus-Response Loop": `Perceive` -> `Reason` (LLM) -> `Act` (Tools/RPC) -> `Reflect`.
4.  **Synthetic Prompt Generation:**
    *   Templates to wrap system events (logs, errors) into LLM-readable prompts.
5.  **Safety Guardrails:**
    *   Rate limiting (max actions/minute).
    *   Human-in-the-loop gates for critical actions (`component:destroy`).

**Success Criteria:**
*   Agent runs as a persistent daemon.
*   Agent accepts and prioritizes events from a queue.
*   Agent maintains context across multiple interactions.
*   Agent demonstrates "Reflection" (evaluating its own action results).

**Reference:** `.github/AGENT_ARCHITECTURE.md`


## Activity Log

- 2025-12-01 @tobiu added the `epic` label
- 2025-12-01 @tobiu added the `ai` label
- 2025-12-01 @tobiu added the `architecture` label

