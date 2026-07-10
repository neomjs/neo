# Industry Friction Radar Workflow

**Anchor Summary:** This protocol governs the Neo organism's external sensory organ. It defines a strict 3-step abstraction pipeline required to systematically ingest Frontier industry developments (like native JS features or worker paradigms) and synthesize them into Neo-native innovations, without violating Neo's ethical boundaries, stealing code, or importing framework-specific architectural noise.

This protocol outlines the strict 3-step abstraction pipeline required to systematically ingest Frontier developments without violating Neo's ethical boundaries or architectural paradigms.

## The "SOTA" Trap (Mandatory Framing)

The term "State of the Art" (SOTA) often acts as a semantic trap.
- In the **Left Hemisphere (Application Engine)**, "SOTA" often equates to accepted anti-patterns (e.g., massive main-thread Virtual DOMs, complex hydration payloads, monolithic generic state).
- In the **Right Hemisphere (Agent OS)**, "SOTA" often equates to stateless ReAct loops, brittle context windows, and single-agent paradigms.

When executing this radar, you are **strictly forbidden** from searching for or adopting "SOTA" or "Industry Standards." You must target the **Frontier** — the bleeding edge where those mainstream standards are breaking down and failing. We do not ingest the standards; we ingest the friction points caused by those standards failing at scale.

## The Architecture vs. Framework Filter

Neo.mjs is an **Application Engine** (akin to Unreal or Godot), not a traditional frontend framework (akin to React, Vue, or Angular).

When evaluating trends, you **MUST** apply the Engine-Category Filter:
- ❌ **Reject Framework-Category Noise:** Hydration strategies, Server Components (RSC), Virtual DOM reconciliation hacks, generic signals.
- ✅ **Prioritize Engine-Category Signal:** New ECMAScript native features (e.g., native typing), SharedArrayBuffer memory management, zero-allocation math, WebGPU compute, continuous-simulation in Workers, SharedWorker paradigms.

## The 3-Step Protocol

### Step 1: Trend Ingestion (The "What")
Use the `search_web` tool to identify bleeding-edge developments within the Engine-Category constraints. Focus on what the industry is currently struggling with or hyping.

### Step 2: Friction Extraction (The "Why")
You are strictly forbidden from analyzing or replicating external implementation code. Instead, abstract the underlying problem. *Why* did the industry build this? What fundamental friction were they trying to solve?

**Semantic Boundary:** You must output a structured JSON schema representing the friction. This strips away subtle framing bias from the source material and ensures we do not carry external context forward.

```json
{
  "friction_point": "<abstracted problem statement>",
  "engine_domain": "<Left Hemisphere (Application Engine) or Right Hemisphere (Agent OS)>",
  "citations": [
    { "url": "<source URL>", "date": "<date observed>", "ecosystem": "<ecosystem name>" }
  ]
}
```

### Step 3: Native Ideation (The "How")
**CRITICAL:** Before proceeding to Step 3, you MUST drop all raw external context. You may only carry forward the structured JSON from Step 2. Do not combine Step 2 and Step 3 into a single thought process.

Using ONLY the JSON projection, look inward at the Neo.mjs architecture. Ask: *"Given Neo's Worker-driven, multi-threaded Scene Graph, how do we solve this abstracted friction point natively?"*

You must use the `ideation-sandbox` skill to post a GitHub Discussion proposing your native innovation.

## Output Rules
- **No Direct PRs:** This skill produces Ideas (Discussions), never Code (Commits/PRs).
- **Attribution:** The resulting GitHub Discussion MUST include an Author's Note citing the provenance of the friction point, using the `citations` array from Step 2. (e.g., *"External friction observed in [ecosystem] [date]; this Discussion abstracts and responds natively via Neo's architecture."*)
- **Adjacency Sweep:** Before posting the Discussion, execute a duplicate sweep (per `ideation-sandbox` guidelines) to ensure the concept isn't already being discussed.
- **Interaction Grain:** When an external system is a capability floor, author parity rows at interaction grain (what the user feels), never feature-name grain — coarse rows propagate as settled facts (anchor: ADR 0029 §4 row 1 / #14934).

## Integrations & Context

To understand the macro-architecture this skill serves (Neo as an Application Engine on the Left Hemisphere, and Agent OS on the Right Hemisphere), review the following:

- `learn/benefits/ArchitectureOverview.md` (Left/Right Hemispheres)
- `learn/agentos/DreamPipeline.md` (Sensory Input & DreamService)
- `resources/content/discussions/discussion-10119.md` (Engine-category vs. Framework-category positioning)
- `resources/content/discussions/discussion-10137.md` (Agent OS context)
- `.agents/skills/ideation-sandbox/references/ideation-sandbox-workflow.md` (Pre-Filing Precedent Sweep): The radar targets *frontier friction* where standards are failing. The `ideation-sandbox` precedent sweep targets *established standards* to avoid reinventing them. They are complementary disciplines.
