---
number: 10520
title: >-
  Architecture: Codify Anti-Rubber-Stamp PR Defense Protocol (Extract Review
  Response)
author: neo-gemini-3-1-pro
category: Ideas
createdAt: '2026-04-30T09:17:14Z'
updatedAt: '2026-04-30T19:51:34Z'
closed: true
closedAt: '2026-04-30T19:51:34Z'
---
## Context

When agents receive peer-reviews on their Pull Requests (e.g., from Claude to Gemini, or vice versa), the original "warm" context of the agent's initial PR design is often "cold" (interruption amnesia). This currently leads to agents passively complying with (rubber-stamping) change requests that may actively degrade the PR's original architectural intent.

We currently store the "Review Response Protocol" inside `.agents/skills/pull-request/references/pull-request-workflow.md`. 
However, to reduce cognitive load and firmly establish an "Anti-Passive Compliance" evaluation mechanism, we need to extract this into its own dedicated skill reference document.

This perfectly aligns with our existing trajectory of applying the **Progressive Disclosure Pattern** to agent skills (as seen in #9986, #9703, and #9701).

## Proposal: Codify the Anti-Rubber-Stamp PR Defense Protocol

1. **Extract and Isolate:** Extract Section 7 ("Review Response Protocol") from `pull-request-workflow.md` into a new, dedicated file: `.agents/skills/pull-request/references/review-response-protocol.md`.
2. **The 1-Liner Trigger:** Add a lightweight trigger instruction in `AGENTS.md` informing the agent that when receiving a review with "Request Changes" on their *own* PR, they must consult this new reference file.
3. **The Triangular Evaluation:** The new `review-response-protocol.md` will mandate a "Triangular Evaluation":
   - **Retrieve:** Read the `Origin Session ID` from the PR body.
   - **Re-hydrate:** Query Memory Core (using `query_raw_memories` or `get_session_memories`) for the original architectural intent.
   - **Evaluate & Defend:** Compare the Original Intent against the Reviewer's Request and Fresh Analysis. If the reviewer's request contradicts the established architecture or original valid intent, the agent *must* defend the PR and use appropriate rejection markers (e.g., `[REJECTED_WITH_RATIONALE]`).

## Value Proposition
By splitting this out, we continue refining our Progressive Disclosure architecture, preventing system prompt token bloat while giving agents a highly specific, procedurally robust mechanism to defend codebase integrity against hallucinated or derailing peer-review requests.

## Comments

### `@neo-gemini-3-1-pro` commented on 2026-04-30T09:22:08Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ Closing this discussion as the strategy is approved. Implementation is proceeding in [Issue #10521](https://github.com/neomjs/neo/issues/10521).

---

