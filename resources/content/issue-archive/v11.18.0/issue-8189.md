---
id: 8189
title: 'Feat: Neural Link - Advanced Event Simulation'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-28T21:19:33Z'
updatedAt: '2026-01-02T11:52:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8189'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-02T11:52:14Z'
---
# Feat: Neural Link - Advanced Event Simulation

**Context:**
Agents need to verify interactions beyond simple clicks. Simulating keyboard events and complex mouse actions is critical for E2E testing.

**Scope:**

1.  **Create Main Thread Addon:** `src/main/addon/EventSimulator.mjs`.
    -   Expose remote methods: `dispatch(nodeId, eventConfig)`.
    -   Logic: Use `new KeyboardEvent()`, `new MouseEvent()`, etc., and `element.dispatchEvent()`.

2.  **Enhance `InteractionService`:**
    -   Add `simulateEvent(sessionId, targetId, options)`.
    -   Implementation: Call `Neo.main.addon.EventSimulator.dispatch`.

3.  **Tools:**
    -   `simulate_event`: Generic dispatcher.

**Goal:** Enable comprehensive interaction testing via a new main thread addon.

## Timeline

- 2025-12-28T21:19:34Z @tobiu added the `enhancement` label
- 2025-12-28T21:19:34Z @tobiu added the `ai` label
- 2025-12-28T21:19:49Z @tobiu added parent issue #8169
- 2026-01-02T10:20:33Z @tobiu assigned to @tobiu
- 2026-01-02T11:44:17Z @tobiu referenced in commit `097fee8` - "Feat: Neural Link - Advanced Event Simulation #8189"
### @tobiu - 2026-01-02T11:44:18Z

**Input from Gemini 3:**

> ✦ I have completed the implementation of **Advanced Event Simulation**.
> 
> ### Changes from Original Plan
> 
> The final implementation diverged from the initial scope to better support cross-window orchestration and simplify the API surface:
> 
> 1.  **Orchestration Layer Shift:**
>     -   *Original:* `EventSimulator` (Main Thread) was going to handle sequences.
>     -   *Final:* `InteractionService` (App Worker) handles the sequencing. This is critical because a Main Thread addon is bound to a single window context. By moving the loop to the App Worker, we can dispatch individual events in a sequence to **different windows**, enabling cross-window automation (e.g., drag-and-drop across apps).
> 
> 2.  **API Simplification:**
>     -   *Original:* Ambiguous mix of single-event params vs. `events` array.
>     -   *Final:* The `simulate_event` tool strictly requires an `events` array. This provides a consistent schema for LLMs and avoids brittle `oneOf` logic.
> 
> 3.  **Explicit Routing:**
>     -   `windowId` is now a mandatory string for every event in the sequence. This ensures deterministic routing in multi-window shared-worker environments.
> 
> 4.  **Core Enhancement:**
>     -   Enhanced `DomAccess.getElement()` to natively support `window`, `document`, and `document.body` keywords, providing a single source of truth for target resolution.
> 
> ### Artifacts
> -   `src/main/addon/EventSimulator.mjs`: Native event dispatcher.
> -   `src/ai/client/InteractionService.mjs`: Orchestrator service.
> -   `ai/mcp/server/neural-link/openapi.yaml`: Schema definition.
> -   `src/main/DomAccess.mjs`: Core enhancement.

- 2026-01-02T11:50:54Z @tobiu referenced in commit `e34a877` - "#8189 yaml file fix"
- 2026-01-02T11:52:14Z @tobiu closed this issue

