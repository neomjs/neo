# Sandman Handoff Alerts

This file tracks topological conflict alerts generated during overnight REM sleep cycles. Agents MUST reconcile these conflicts structurally upon startup.

## Active Conflicts

- **[SUPERSEDES]** `epic-9736`: The detailed architectural refinement path for Hebbian Memory Integration was superseded by the user-initiated and high-priority pivot to the entirely new task: 'Implement Agent Self-Discovery via Neural Link Introspection' (epic-9299). (Source Session: bfb21a96-8591-477d-a517-e8cd39eda19a)
- **[SUPERSEDES]** `issue-9737`: This sub-task is structurally dependent on the now-superseded primary objective, Hebbian Memory Integration (#9736). (Source Session: bfb21a96-8591-477d-a517-e8cd39eda19a)
- **[SUPERSEDES]** `issue-9738`: This sub-task is structurally dependent on the now-superseded primary objective, Hebbian Memory Integration (#9736). (Source Session: bfb21a96-8591-477d-a517-e8cd39eda19a)

- **[SUPERSEDES]** `issue-9743`: The complete implementation of the 'memory-core' REM/Dream extraction pipeline, including Graph-RAG and the automated handover protocol, renders the requirements addressed by this ticket obsolete and superseded. (Source Session: 41df81fb-54b0-41ae-a179-d3b0f12faa36)
- **[SUPERSEDES]** `issue-9742`: The fully functional 'memory-core' and the implementation of robust path traversal security and configuration-driven ingestors supersede the original requirements of this ticket. (Source Session: 41df81fb-54b0-41ae-a179-d3b0f12faa36)
- **[SUPERSEDES]** `issue-9741`: The resolution of all critical SQLite integration issues and the implementation of Vector Apoptosis ensure that the system state surpasses the scope and requirements of this ticket. (Source Session: 41df81fb-54b0-41ae-a179-d3b0f12faa36)
- **[SUPERSEDES]** `issue-9740`: The successful creation of a configuration-driven FileSystemIngestor and the autonomous status of the 'memory-core' supersede the initial goals of this ticket. (Source Session: 41df81fb-54b0-41ae-a179-d3b0f12faa36)

## Computed Golden Path (Strategic Recommendation)

Based on the latest Tri-Vector Synthesis and Topological Priorities, the following tasks are mathematically recommended as the next immediate focus:

1. **issue-9673**: Score 11.00 (Semantic: 5.00, Structural: 1.00)
   - *Technical Awareness: Hybrid GraphRAG (Native Edge Graph & App Mapping)*
2. **issue-9637**: Score 11.00 (Semantic: 5.00, Structural: 1.00)
   - *Grid Multi-Body: E2E Telemetry Adjustments for Dual-Pipeline Scrolling*
3. **issue-9636**: Score 11.00 (Semantic: 5.00, Structural: 1.00)
   - *Grid Multi-Body: Simplify GridDragScroll Scrollbar Hit Detection*
- **[Codebase Gap]** Node `Zombie Ollama Runner Processes`: [DOC_GAP] No documentation or tests found regarding the handling, detection, or cleanup of zombie Ollama runner processes in the provided directory tree. (Source Session: 67b641b1-4354-4bd5-ba22-0ed333a6847b)
- **[Codebase Gap]** Node `Neo.canvas.Base`: [DOC_GAP] The 'Neo.canvas.Base' class is a critical foundation for high-performance canvas renderers (OffscreenCanvas in Workers). While 'learn/guides/advanced/CanvasArchitecture.md' exists and explains the conceptual architecture and a specific implementation (Luminous Flux), it lacks a formal API reference for the 'Neo.canvas.Base' class itself. There is no documentation describing the methods 'initGraph', 'clearGraph', 'updateSize', 'updateMouseState', and hooks like 'onGraphMounted' or 'updateResources'. Developers cannot know the API surface of the base class without reading the source code. Additionally, there is no unit test coverage for the base class in 'test/playwright/unit/'. (Source Session: f971ec44-5ad6-48b9-92e0-790524267d09)
- **[Codebase Gap]** Node `Neo.canvas.Header`: [DOC_GAP] Class `Neo.canvas.Header` implements complex 'Luminous Flux' visual theme, Zero-Allocation geometry buffers, and specific physics for UI diversion (detailed in code comments but not in native documentation). No corresponding doc file exists in `docs/` or `learn/` that explains this architectural approach or the theme's configuration. (Source Session: f971ec44-5ad6-48b9-92e0-790524267d09)
- **[Codebase Gap]** Node `Neo.component.CanvasShared`: [DOC_GAP] The class `Neo.app.SharedCanvas` (implemented in `src/app/SharedCanvas.mjs`) provides a critical abstraction for connecting App Workers to SharedWorker canvas renderers. While `learn/guides/advanced/CanvasArchitecture.md` discusses the high-level architecture and uses a conceptual `HeaderCanvas` example, there is no API reference or developer guide specifically for the `Neo.app.SharedCanvas` base class itself. Developers need documentation on its required config properties (`rendererClassName`, `rendererImportPath`) and its lifecycle methods to properly implement their own SharedWorker-backed components. (Source Session: f971ec44-5ad6-48b9-92e0-790524267d09)
