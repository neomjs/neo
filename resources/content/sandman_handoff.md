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

1. **issue-9673**: Score 6.78 (Semantic: 0.89, Structural: 5.00)
   - *Technical Awareness: Hybrid GraphRAG (Native Edge Graph & App Mapping)*
2. **issue-9299**: Score 5.01 (Semantic: 1.01, Structural: 3.00)
   - *Implement Agent Self-Discovery via Neural Link Introspection*
3. **issue-9298**: Score 3.95 (Semantic: 0.97, Structural: 2.00)
   - *Implement Moltbook Demo Agent using Chrome DevTools MCP*
- **[Codebase Gap]** Node `Bug #7834`: [DOC_GAP] No test coverage or documentation found for Bug #7834 (Button click events failing on mobile devices). The filtered directory tree contains unrelated bug tests (CollectionBug, TreeStoreCollapseBug, DuplicateIdBug), but nothing addressing mobile interaction events. (Source Session: self-healing-demo-v1)
- **[Codebase Gap]** Node `Tickets KB Main Enhancement`: [DOC_GAP] No documentation or test files found related to the 'Tickets Knowledge Base' overhaul. The directory tree contains core system components and addons, but lacks any KB-specific modules or guides. (Source Session: ffb56779-0ce0-48b1-b1b4-66cd2508e6a9)
- **[Codebase Gap]** Node `TreeList Navigation`: [DOC_GAP] No documentation or tests exist for 'deep linking' in TreeList. While 'expandParents' is tested in 'test/playwright/unit/tree/List.spec.mjs', it focuses on VDOM structural integrity (fixing a 'Chimera' bug) rather than the functional requirement of deep linking (e.g., URL synchronization, state restoration, or navigation entry points). (Source Session: ffb56779-0ce0-48b1-b1b4-66cd2508e6a9)
- **[Codebase Gap]** Node `Release Badge`: [DOC_GAP] No documentation or test files found for the 'Release Badge' feature. Additionally, the provided source file 'src/component/StatusBadge.mjs' appears to be a generic status badge and does not contain specific logic for the ticket-to-release badge functionality. (Source Session: ffb56779-0ce0-48b1-b1b4-66cd2508e6a9)
- **[Codebase Gap]** Node `CSS Fixes`: [DOC_GAP] No relevant test files or documentation found in the directory tree to verify the resolution of scroll padding and icon color collisions. (Source Session: ffb56779-0ce0-48b1-b1b4-66cd2508e6a9)
- **[Codebase Gap]** Node `Issue #8193`: [DOC_GAP] No documentation or specific test files found for the 'namespace discovery' feature. The provided directory tree contains only a Playwright test for OpenAPI issues, which does not cover the implementation or verification of namespace discovery. (Source Session: ff0f2fee-295f-4998-8f0a-58fa09591918)
- **[Codebase Gap]** Node `moveComponent Ticket`: [DOC_GAP] The `moveComponent` API is well-covered by tests (see `test/playwright/component/container/AtomicMoves.spec.mjs`), but it is missing from the documentation. `learn/guides/fundamentals/DeclarativeComponentTreesVsImperativeVdom.md` only describes the manual process of moving components via `removeAt` and `add`, leaving the newer, atomic `neo.moveComponent` utility undocumented. (Source Session: fd372d92-7a5c-4567-afba-1de91620e909)
- **[Codebase Gap]** Node `Issue #9077`: [DOC_GAP] No test files or documentation found for the refactored component 'src/form/field/Country.mjs'. The filtered directory tree contains no relevant files for this specific field. (Source Session: fd210d0e-d8c0-4c96-9706-53bb922b9e86)
- **[Codebase Gap]** Node `Ticket #8462`: [DOC_GAP] No files related to 'SectionsList' were found in the directory tree. There is a complete lack of evidence for existing documentation or test coverage regarding the styling and implementation of the SectionsList component. (Source Session: fd1a1232-8923-469d-990b-73b00efd1ef1)
- **[Codebase Gap]** Node `.neo-list-item`: [DOC_GAP] The CSS class `.neo-list-item` intended for `SectionsList` is not documented in the `docs/` or `learn/` directories, and there are no corresponding tests in `test/playwright/` to verify the rendering or styling of these list items. (Source Session: fd1a1232-8923-469d-990b-73b00efd1ef1)
- **[Codebase Gap]** Node `Issue #8620`: [DOC_GAP] No functional tests or documentation found for Element.moveBefore support. The provided directory tree contains only a workflow test file (OpenapiIssues.spec.mjs), which does not cover the implementation or usage of the Element.moveBefore method. (Source Session: fd130b21-2cfe-4230-b3ba-4d2cd527d2d2)
- **[Codebase Gap]** Node `src/state/Provider.mjs`: [DOC_GAP] While comprehensive guides exist for reactivity and usage, there is no documentation regarding 'store serialization' specifically mentioned in the node description. Additionally, no corresponding test files were found in the provided directory tree for src/state/Provider.mjs. (Source Session: fd099a94-e4dc-4780-ab47-f2f91685aaf2)
- **[Codebase Gap]** Node `src/layout/Base.mjs`: [DOC_GAP] src/layout/Base.mjs (Base layout class) lacks native test coverage and developer documentation. While 'learn/guides/uibuildingblocks/Layouts.md' exists, it is a user guide for applying layouts via configuration and does not document the internal serialization logic or the Base class API for developers. (Source Session: fd099a94-e4dc-4780-ab47-f2f91685aaf2)
- **[Codebase Gap]** Node `src/layout/Flexbox.mjs`: [DOC_GAP] The 'gap' property mentioned in the Flexbox.mjs description (prefix and gap serialization) is missing from the documentation in 'learn/guides/uibuildingblocks/Layouts.md', which only covers basic align and pack properties for vbox/hbox. Additionally, there are no corresponding test files for the layout implementation in the provided directory tree. (Source Session: fd099a94-e4dc-4780-ab47-f2f91685aaf2)
