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

1. **issue-9673**: Score 3.21 (Semantic: 1.11, Structural: 1.00)
   - *Technical Awareness: Hybrid GraphRAG (Native Edge Graph & App Mapping)*
2. **issue-9299**: Score 2.83 (Semantic: 0.91, Structural: 1.00)
   - *Implement Agent Self-Discovery via Neural Link Introspection*
3. **issue-9767**: Score 2.78 (Semantic: 0.89, Structural: 1.00)
   - *Investigate 'Viewer has null permission' bug in manage_issue_assignees MCP tool*
- **[Codebase Gap]** Node `GraphQL permission bug`: [DOC_GAP] No specific test coverage or documentation found for the 'manage_issue_assignees' tool or GraphQL permission logic in the provided directory tree. (Source Session: 5b79fa84-43cc-4408-be85-17a06015a338)
- **[Codebase Gap]** Node `Ticket #8201`: [DOC_GAP] No documentation or tracking files found in the provided directory tree for Ticket #8201 regarding the tool discovery bug and its resolution. (Source Session: fd01f7c2-ece9-4878-9cdb-09d767f7afed)
- **[SUPERSEDES]** `issue-7825`: Issue #7825 (the original parsing bug) is superseded by issue #7826, which implements the robust Neo.util.Json utility to resolve the failure. (Source Session: fcb3bf15-35e9-4e88-963f-35da7b21537b)
- **[Codebase Gap]** Node `JSON Parsing Failure`: [DOC_GAP] No relevant documentation or test files found in the directory tree for handling 'JSON Parsing Failure' specifically regarding LLM response summarization status. This critical startup error needs a documented recovery path and a regression test to ensure LLM response parsing is robust. (Source Session: fcb3bf15-35e9-4e88-963f-35da7b21537b)
- **[Codebase Gap]** Node `Neo.util.Json Refactor`: [DOC_GAP] Neo.util.Json.extract() is a specialized utility for parsing AI-generated JSON from Markdown blocks, but it is not mentioned in 'learn/guides/coreengine/Utilities.md' or any other documentation found in the directory tree. (Source Session: fcb3bf15-35e9-4e88-963f-35da7b21537b)
- **[Codebase Gap]** Node `Neo.util.Json`: [DOC_GAP] Neo.util.Json is present in the source (src/util/Json.mjs), but is completely absent from the 'learn/guides/coreengine/Utilities.md' and other visible documentation files. Additionally, there is no corresponding test file in 'test/playwright/unit/util/' (e.g., Json.spec.mjs), whereas other utilities like Rectangle.spec.mjs exist. (Source Session: fcb3bf15-35e9-4e88-963f-35da7b21537b)
