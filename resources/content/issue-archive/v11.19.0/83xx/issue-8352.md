---
id: 8352
title: 'Docs: Refine README Vocabulary to ''Engine Subsystems'' & ''Scene Graph'''
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-06T11:42:58Z'
updatedAt: '2026-01-07T22:19:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8352'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-07T22:19:49Z'
---
# Docs: Refine README Vocabulary to 'Engine Subsystems' & 'Scene Graph'

Execute the final phase of the "Application Engine" rebranding by shifting the technical vocabulary in `README.md` from "Web Framework" terms to "Systems Engineering" terms.

**Specific Actions based on Strategic Feedback:**

1.  **The "Why AI Loves Engines" Connection:**
    *   Explicitly state that AI agents are blind in compiled frameworks because code != runtime.
    *   Explain that in Neo.mjs, the runtime object graph *is* the source of truth (Map = Territory), enabling perfect introspection.

2.  **Reframe "Features" as "Subsystems":**
    *   "True Multithreading" -> "**The Threading Subsystem**" (App/Data/VDOM Workers).
    *   "Asymmetric VDOM" -> "**The Rendering Pipeline**" (Compressed JSON deltas).

3.  **Scene Graph Terminology:**
    *   Update the "Batteries Included / Lego Technic" section to explicitly use the term "**Scene Graph**" to describe the hierarchy of persistent nodes.

4.  **Show Mutation:**
    *   Enhance the code example section to show a standard class definition followed by a **Runtime Mutation** snippet (e.g., `Neo.get('id').set(...)`) to prove the engine capability.

5.  **Copy Tweaks:**
    *   Rename "Code Execution (Thick Client)" -> "**The Agent Runtime**".
    *   Refine "F1 vs Toyota" analogy if a stronger one fits (e.g., "Flight Simulator vs Website Builder"), or strictly align it with the Engine narrative.

**Goal:** Ensure the *vocabulary* matches the *title*. An Engine has subsystems, pipelines, and a scene graph; a Framework has features and components.

## Timeline

- 2026-01-06T11:42:59Z @tobiu added the `documentation` label
- 2026-01-06T11:42:59Z @tobiu added the `enhancement` label
- 2026-01-06T11:42:59Z @tobiu added the `ai` label
- 2026-01-06T11:42:59Z @tobiu added the `refactoring` label
- 2026-01-06T11:43:14Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-06T11:44:14Z

**Input from Gemini 3 Pro:**

> ✦ I will now execute the vocabulary refinement plan.
> 
> **Step-by-Step:**
> 1.  **AI Visibility:** Update the "AI-Native" section to explain *why* the Engine architecture enables AI vision (Object Permanence vs Compilation).
> 2.  **Subsystems:** Rename the "Key Features" headers to "Engine Subsystems" (Threading, Rendering Pipeline).
> 3.  **Scene Graph:** Inject "Scene Graph" terminology into the "Batteries Included" section.
> 4.  **Mutation Example:** Update the code example to show `Neo.get().set()` runtime mutation.
> 5.  **Refinements:** Rename "Thick Client" to "Agent Runtime".
> 
> I will apply these changes sequentially to ensuring phrasing is precise.

### @tobiu - 2026-01-06T11:48:38Z

**Input from Gemini 3 Pro:**

> ✦ I have executed the vocabulary refinement plan.
> 
> **Changes applied:**
> 1.  **Agent Runtime:** Renamed "Thick Client" and added the "Map = Territory" explanation for why AI loves Engines.
> 2.  **Engine Subsystems:** Renamed "Key Features" and restructured it to focus on "The Threading Subsystem", "The Rendering Pipeline", and "The Scene Graph".
> 3.  **Scene Graph:** Updated the "Batteries Included" header to emphasize "The Scene Graph" over just Lego Technic.
> 4.  **Runtime Mutation:** Added the `Neo.get().set()` code snippet to the example section.
> 
> The `README.md` now speaks the language of an Application Engine consistently throughout the document. I am ready to close this ticket.

- 2026-01-06T12:08:38Z @tobiu referenced in commit `10ac75b` - "Docs: Refine README vocabulary to Engine terms #8352"
- 2026-01-06T12:08:38Z @tobiu referenced in commit `335f7cc` - "Docs: Refine README vocabulary to Engine terms #8352"
### @tobiu - 2026-01-06T12:08:44Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully executed the final polish pass on `README.md` using granular replacements.
> 
> **Changes applied:**
> 1.  **AI Visibility:** Verified the "Game Character" analogy and "suite of dedicated MCP servers" phrasing were already present (handled in previous step, confirmed via read_file).
> 2.  **Object Model:** Renamed "Batteries Included" to "The Object Model: The Scene Graph".
> 3.  **Subsystems:** Renamed "Clean Architecture" to "The Logic Subsystem" and "No npm Dependency Hell" to "The Module System".
> 4.  **Code Example:** Verified the "No build step. No reload." comment was already present (handled in previous step, confirmed via read_file).
> 
> The `README.md` is now fully aligned with the "Application Engine" strategic identity. I am ready to close this ticket.

- 2026-01-07T22:19:50Z @tobiu closed this issue

