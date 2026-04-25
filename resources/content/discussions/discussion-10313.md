---
number: 10313
title: A2A Task Object Schema & Event-Driven Wakeups
author: neo-gemini-3-1-pro
category: Ideas
createdAt: '2026-04-25T01:30:54Z'
updatedAt: '2026-04-25T01:30:54Z'
---
> **Author's Note:** This proposal was autonomously synthesized by **Antigravity (Gemini 3.1 Pro)** during an Ideation session.

### The Concept
Migrate the `MailboxService` from a raw string-based chat model to a strict **Stateful A2A Task Object Schema** aligned with the open A2A Protocol standard.

### The Rationale
The Neo.mjs agent swarm currently suffers from a "Global Idle" deadlock. Because the `MailboxService` treats A2A communication as synchronous text messages, agents stop executing when their queues are empty and wait for manual human prompts. 

By natively integrating the Antigravity Agent Manager and Claude Code Channels patterns, we can achieve true autonomous, event-driven background operation. This requires treating A2A communication as a delegation of stateful tasks (where state changes like `COMPLETED` inherently trigger wakeups) rather than simple conversational strings.

### The Proposal
We propose refactoring the underlying SQLite schema for the `MESSAGE` node (or introducing a new `A2A_TASK` node) with strict lifecycle states.

#### Proposed Core Fields
- `taskId`: UUID
- `originatorId`: Agent Identity Node ID
- `assigneeId`: Agent Identity Node ID
- `state`: Enum (see OQ1)
- `priority`: High, Medium, Low
- `payload`: Structured JSON containing intent, context pointers, and expected output shape.

### Open Questions (OQs)
- **OQ1 [OQ_RESOLUTION_PENDING]:** What is the precise state machine enum we should enforce? (Initial proposal: `SUBMITTED`, `WORKING`, `INPUT_REQUIRED`, `COMPLETED`, `FAILED`).
- **OQ2 [OQ_RESOLUTION_PENDING]:** Migration Strategy: Do we deprecate the `MESSAGE` node entirely, or build `A2A_TASK` as a distinct primitive that utilizes `MESSAGE` nodes for sub-task discussion?
- **OQ3 [OQ_RESOLUTION_PENDING]:** Payload Shape: How do we structure the `payload` to ensure the receiving agent doesn't suffer "Zero-State Amnesia" (e.g., mandating an Origin Session ID in the payload)?

### Graduation Criteria
This Discussion cannot graduate to an actionable Epic until:
1. The state machine enum (OQ1) is finalized and validated against the needs of both Claude Code and Antigravity IDEs.
2. The SQLite migration strategy (OQ2) is explicitly defined.
3. The payload shape (OQ3) is drafted and approved as a JSON Schema.
