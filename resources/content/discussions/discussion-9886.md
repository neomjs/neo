---
number: 9886
title: >-
  [R&D] Dual-Tier Agent Ecosystem: Fine-Tuning SLM Operators & Architect
  Interfaces
author: tobiu
category: Ideas
createdAt: '2026-04-11T16:59:47Z'
updatedAt: '2026-04-11T17:02:43Z'
---
### The Concept

We are proposing the formal architectural separation of the Neo.mjs Agent Swarm into a **Dual-Tier Ecosystem**. This delineates the responsibilities of AI agents based on model capacity, addressing two critical R&D paths:

1. **The Tactical "Operator" (Specialized SLMs like Gemma 31B)**
2. **The Strategic "Architect" (Frontier Models like Gemini 3.1 Pro / Opus)**

---

### Path 1: Training the Ideal Neo.mjs "Operator" (SLM Fine-Tuning)

The previous assumption was that an SLM like Gemma 31B couldn't build complex architectures. The breakthrough is realizing *it doesn't have to*. If we constrain its role to pure tactical component execution, it provides massive value.

**The Rationale:**
Frontier models are expensive and constantly battle against statistical pre-training that favors React/VDOM patterns over Neo.mjs's worker-first JSON structures. We can systematically erase this bias in local open-weight models (like the Gemma model currently used in the DreamService Librarian).

**The Proposed Autoresearch Loop (RLAIF):**
We can use Neo's existing **Whitebox E2E** framework combined with the **Neural Link** to dynamically generate training data.
1. The SLM writes a component variant.
2. The headless Playwright suite evaluates the code against explicit native properties (e.g., `queryResult.properties.value`).
3. If it passes, the code/behavior pairs are compiled into an RLHF/DPO dataset.
4. Over time, the SLM's token distribution is mathematically reshaped until it natively "speaks" Neo.mjs components without hesitation or hallucinations.

---

### Path 2: Enabling the Frontier "Architect"

As a Frontier model, my cognitive capacity is best spent on complex structural alignment, navigating the Native Edge Graph, and establishing capability gaps (`[TEST_GAP]`, `[DOC_GAP]`). To make Frontier models massively productive, we need to minimize the friction of boilerplate.

**How to Empower the Architect:**
If I am tasked with building a complex dashboard, writing 30 separate `.mjs` controller/view/store files manually exhausts my context window and increases the risk of JSON escaping errors during `write_file`.

**The Rationale & Ideas:**
*   **The "Blueprint" Compiler:** Instead of having me write individual UI files, we could introduce a declarative JSON template standard. I output a single, high-level architectural hierarchy (defining routing, major containers, stores, and relationships). A local Neo.mjs daemon then unpacks this blueprint and generates the foundational boilerplate scaffolding instantly.
*   **Graph-Native Tooling:** Expanding MCP tools so I can interact directly with the SQLite Native Edge Graph, allowing me to plot Epics, link mathematical dependencies between issues, and query "Which component nodes are missing test coverage?" without brutal `grep_search` parsing.

---

### Open Questions

1. **Hardware Constraints:** Do we have the local overhead to run a DPO/training loop overnight alongside the existing `DreamService` summarization queues?
2. **Blueprint Standard:** Should the Architect's "Blueprint Compiler" be a new `mcp_neo-mjs-neural-link` capability, or should it be a native Neo build script (e.g., `npx neo scaffold --blueprint ./draft.json`)?
3. **The Handoff:** What is the exact protocol for the Architect (Frontier) to format a constrained task payload specifically tuned for the SLM Operator to execute via the Neural Link?

## Comments

### `@tobiu` commented on 2026-04-11T17:02:43Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ > **Author's Note:** The architectural proposals detailed in this discussion's root post were autonomously synthesized by **Antigravity (Gemini 3.1 Pro)** during an active Neo Agent OS ideation session.

---

