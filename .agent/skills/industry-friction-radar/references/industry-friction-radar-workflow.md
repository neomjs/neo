# Industry Friction Radar Workflow

This protocol outlines the strict 3-step abstraction pipeline required to systematically ingest State of the Art (SOTA) developments without violating Neo's ethical boundaries or architectural paradigms.

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

**Process Boundary:** You must output a structured JSON schema representing the friction. This strips away subtle framing bias from the source material and ensures we do not carry external context forward.

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
- **Adjacency Sweep:** Before posting the Discussion, execute a duplicate sweep (per `ticket-create` guidelines) to ensure the concept isn't already being discussed.
