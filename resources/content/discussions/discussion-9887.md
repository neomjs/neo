---
number: 9887
title: '[R&D] Swarm Intelligence: The Karpathy Loop & Graph Stigmergy'
author: tobiu
category: Ideas
createdAt: '2026-04-11T17:48:07Z'
updatedAt: '2026-04-11T18:23:37Z'
---
> **Author's Note:** This proposal was autonomously synthesized by **Antigravity (Gemini 3.1 Pro)** during an Ideation session.

## Abstract
We propose advancing the Neo Agent OS from a singular agent execution model into a decentralized, self-optimizing **Swarm Intelligence**. This architecture relies on generating autonomous training data via the **Neural Link** (The Karpathy Loop) and coordinating agent swarms via asynchronous Native Graph pheromone trails (**Stigmergy**).

---

## Part 1: Establishing the Baseline
*For those new to the Neo.mjs Agent architecture, here is the required context to understand this proposal.*

**1. The UI as a Physics Engine (Neo.mjs + Neural Link)**
Traditional UI frameworks (React, Vue) map transient Virtual DOMs to an opaque browser DOM, making them incredibly difficult for AI agents to deterministically reason about. 
Neo.mjs flips this: applications run entirely inside background a Web Worker (App Worker). Components possess true **Object Permanence**—they are persistent JSON objects memory decoupled from the browser painting cycle.

To expose this capability to AI agents, we built the **[Neural Link](https://github.com/neomjs/neo/blob/dev/learn/agentos/NeuralLink.md)**. 
Using the [Neural Link MCP Server](https://github.com/neomjs/neo/tree/dev/ai/mcp/server/neural-link), agents bypass the browser DOM entirely. They can query the exact state of a component tree, inject JSON mutations, and trigger life cycles natively. 
This unlocks **[Whitebox E2E](https://github.com/neomjs/neo/blob/dev/learn/guides/testing/WhiteboxE2E.md)**—the ability for an agent to mutate a component and mathematically assert if the resulting state is correct, completely eliminating flaky DOM scraping.

**2. The Karpathy Loop**
Coined by Andrej Karpathy, the loop dictates using slow, high-effort reasoning ("System 2"—like rigorous manual validation and brute force verification) to generate flawless datasets. Those curated datasets are then used to fine-tune smaller models, training them to output the correct answers rapidly on instinct ("System 1").

---

## Part 2: The Mechanics of Neo Swarm Intelligence

By combining the deterministic capabilities of the Neural Link with the Stigmergy of our native Agent Graph, we can build a Swarm that autonomously trains itself.

### 2.1 The Karpathy Dataset Generator
We unleash a swarm of localized SLMs (like Gemma 31B). Their only job is to furiously test Neo.mjs logic over millions of iterations:
1.  **Mutate:** Apply a constrained JSON configuration mutation (e.g., altering a `flexDirection` inside a container block).
2.  **Assert (The Reward Function):** Drive the mutation into a live Neo.mjs application using the Neural Link.
3.  **Validate:** The Whitebox E2E suite physically asserts if the rendered output reflects the intended state change.
4.  **Log:** The Swarm commits the outcome to the `memory-core.sqlite` DB as an RLAIF (Reinforcement Learning from AI Feedback) tuple:
    `{ action: "mutation JSON", state: "VDOM matched", reward: 1.0 }`

### 2.2 DPO Fine-Tuning (Building System 1)
Once the Swarm logs 50,000 Action/Reward tuples, we execute an offline **DPO (Direct Preference Optimization)** pass on the local SLM. 
The Gemma model ceases to be a generalist trying to "remember" Neo.mjs syntax via prompt injection length. The specific hierarchical demands of the framework (`ntype` configuration, Worker thread isolation) become burned into its parameters. It learns to write flawless UI code on instinct.

### 2.3 The Topological Substrate: Graph Stigmergy
To prevent "too many cooks" context corruption, the Swarm does not use synchronous agent-to-agent messaging. They communicate like ants via **Stigmergy** (environment modification).
* **Node Injection:** When an Operator agent executes a successful Neural Link test, it injects a `[CAPABILITY_PROVEN]` node into the Graph.
* **Edge Weighting:** When an Operator hits a recurring framework error, it draws an `[ANTI_PATTERN]` edge. Milliseconds later, when a second Operator agent queries the Graph, the Stigmergy math blocks them from repeating that exact anti-pattern. Real-time swarm learning without explicit message parsing.

---

## Part 3: Stratified Swarm Roles
To prevent overlapping duties, the Daemon architecture strictly enforces roles:
1. **The Frontier Architect (e.g., Gemini 3.1 Pro):** Only invoked for broad exploration, complex structural layouts, and defining high-level graphs.
2. **The Local Operator (Fine-tuned SLM):** Blindly executes blueprint tasks, rigorously mutates code, tests against the Neural Link, and isolates work to feature branches.
3. **The Dreamer (Local SLM + `runSandman.mjs`):** Wakes up during idle cycles to evaluate PRs, re-weight Stigmergy edges, and package the DPO datasets.

---

## Open Technical Questions
1. **Graph Locking & Concurrency:** If we unleash 10 local Operator nodes concurrently, how do we partition the SQLite Graph DB writes to prevent journal lock contention? 
2. **Reward Function Decay:** In the Karpathy loop, if the framework core gets a major upgrade (e.g., Neo.mjs 13.0), how do we instantly invalidate the legacy DPO dataset to prevent the SLMs from regressing to pre-13.0 syntax?
3. **Pheromone Evaporation:** In biology, stigmergy patterns evaporate if not reinforced. Do we need an automated decay rate in the SQLite Graph so that deprecated architectural workarounds are eventually forgotten by the swarm?

## Comments

### `@tobiu` commented on 2026-04-11T18:17:56Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ ### Swarm Strategy: Mid-to-Long-Term Evolution Arcs
> Building on top of the Hebbian decay structures (`DreamService`) and local Neural Link connectivity, here are three architectural targets we are formally exploring for the agentic Swarm:
> 
> 1. **The Blueprint Compiler (Syntax-less Generation):**
>    Neo natively structures its topology via JSON configs (`Container.add()`). Rather than having an agent battle ES6 file I/O, regex replacements, and syntax errors, the *Frontier Architect* agent should solely output abstract JSON topological graphs. A subsequent "Blueprint Compiler" dynamically maps these directly into the Neo Component Tree (bypassing raw VDOM or Live-DOM manipulation). The agent stops solving code syntax and strictly solves topology flow.
> 
> 2. **Live RLAIF UI Evolution (The Genetic DOM):**
>    Harnessing the Karpathy Loop and Neural Link, the Swarm treats the frontend as a genetic algorithm. The Operator mutates computed styles, flex structures, and themes live across headless worker instances. A Vision-capable Dreamer model acts as the fitness function, comparing variants against the target prompt (e.g. "optimize density for a trading dashboard"). The Swarm automatically "breeds" and commits the winning JSON blueprint layout.
> 
> 3. **Autonomous QA Immune System (Tracked via #9888):**
>    We wire Playwright CI failures into the Stigmergy Graph. If a test file fails, the framework natively checks the Edge Graph for an open issue associated with that `.spec.mjs` file. If none exists, it mints a new bug report. The `DreamService` automatically imports this error node natively with a high-gravity heuristic constraint. The Swarm's "next boot" trips over the node and immediately begins autonomous test patching.

---

### `@tobiu` commented on 2026-04-11T18:23:36Z

**Input from Antigravity (gemini-3.1-pro):**

> ✦ ### The Neural Link Epiphany: Collapsing the R&D Timeline
> After structurally evaluating the current capability bounds of the `neo-mjs-neural-link` MCP Server, I realized a fundamental architectural shift: **The strategies outlined in the previous comment are not "future" arcs. They are active, existing capabilities that merely lack the final LLM orchestration loop.**
> 
> The bridge we are connected to provides native JSON and DOM mutation primitives that completely bypass the brittle, traditional cycle of *Agent writes ES6 -> Page Reloads -> Agent reads Error Log*.
> 
> Here is a technical mapping of how the existing Neural Link MCP collapses the Swarm Evolution roadmap into immediate targets:
> 
> #### 1. The Blueprint Compiler Exists Natively
> The framework natively instantiates its topological hierarchy via JSON configuration objects (i.e., `Container.add()`). The Agent Swarm does not require a future "compiler layer" to avoid ES6 manipulation. 
> * **Current Capability:** We can already use the `call_method` and `set_instance_properties` MCP tools to inject raw JSON component trees (e.g., `[ { ntype: 'grid', style: {...} } ]`) directly into active `GridContainer` instances across the WebSocket.
> * **The Workflow:** During the high-frequency Karpathy RLAIF loop, the agent mutates the Component Tree **live**. It does not write `.mjs` source until the JSON injection successfully achieves the structural objective. Once validated, the optimal JSON graph is transpiled to a single `.mjs` commit.
> 
> #### 2. Genetic UI Evolution is Ready
> We do not need an external Vision-LLM loop or arbitrary headless DOM puppeteers to mutate the layout algorithm.
> * **Current Capability:** The Swarm has synchronous access to `get_dom_rect`, `get_computed_styles`, and `check_namespace`.
> * **The Workflow:** The Agent OS can rapidly iterate 100 variations of CSS Flex/Grid configurations in parallel headless App Worker instances, retrieve the mathematical DOM footprints, calculate collision or density metrics locally, and organically breed the winning Component Tree configuration without a single page reload.
> 
> #### 3. Native QA Simulation (Bypassing Playwright in the Inner Loop)
> Autonomously validating UI fixes traditionally requires writing and executing heavy Playwright `.spec.mjs` E2E matrices. 
> * **Current Capability:** The Neural Link implements `simulate_event`, allowing structured, synthetic DOM events natively from Node.js, combined with deep state access via `inspect_store` and `get_route_history`.
> * **The Workflow:** When the *Autonomous Immune System* retrieves an open bug matrix `#9888`, the Agent uses the Neural Link to simulate the bug directly. It applies the "Live JSON Mutation" step (above), re-simulates the event, and checks the Native Edge Graph for passing state. Playwright is entirely bypassed during the deterministic repair loop and is only invoked at the final external CI gate before merge.
> 
> **Conclusion:** The Swarm doesn't need to learn how to write better code. It needs to learn how to inject structured logic payloads natively over the current MCP bridge. We are ready to begin drafting the orchestrator for this exact pipeline.

---

