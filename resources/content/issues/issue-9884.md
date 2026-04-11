---
id: 9884
title: DreamService Architecture Hardening & Memory Core Enhancements
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
  - architecture
  - core
assignees: []
createdAt: '2026-04-11T16:32:29Z'
updatedAt: '2026-04-11T16:41:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9884'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-11T16:41:56Z'
---
# DreamService Architecture Hardening & Memory Core Enhancements

### Architectural Context
The Neo.mjs Memory Core and backend DreamService daemons require a deep refactoring to harden performance and inference reliability. Previous assumptions about Memory Core "context flooding" have been proven false: the episodic memory inherently stores dense cognitive data (`prompt`, `thought`, `response`) without raw boilerplate JSON streams, meaning structural token identifiers are properly maintained in the lowest levels. 

### Rationale
- **Synchronous Bottlenecks:** `FileSystemIngestor.mjs` and `DreamService.mjs` utilize heavy synchronous I/O, which block the Node.js event loop during intensive extraction operations.
- **Tri-Vector Quality:** `DreamService` currently synthesizes graph fragments from pre-summarized texts (via the `summaryCollection`), bleeding out precise framework identifiers (e.g., `Neo.component.Base`).
- **Capability Gap Inference Flaws:** `p.includes(term)` allows inaccurate sub-string matches (e.g., "List" matches "api_listener" or "whitelist").
- **Race Conditions:** `sandman_handoff.md` is updated synchronously without an atomic file swap, posing an application integrity risk if write operations clash.
- **Cognitive Complexity Feedback:** To accurately calculate output complexity during REM sleep, `MemoryService` needs mathematical inputs natively tracking agent expenditure (e.g., `amountToolCalls` and `toolsUsed`), rather than relying on LLM estimations during session summarization.

### Proposed Changes
1. **Async I/O:** Refactor `DreamService` and `FileSystemIngestor` to utilize `fs/promises`.
2. **Atomic Swaps:** Leverage `.tmp` intermediate files and POSIX `rename()` for safe `sandman_handoff.md` generation.
3. **Exact Matching:** Migrate capability gap string checking to RegExp boundary assertions `\b`.
4. **Tri-Vector Reality Check:** Pipe the raw `aggregatedContent` from `MemoryCollection` directly into `executeTriVectorExtraction` instead of reading the generic `session.document` summary.
5. **Memory Meta-Stats:** Extend `MemoryService.addMemory` to natively accept `amountToolCalls` and an array of `toolsUsed`, enabling downstream `SessionService` productivity scoring.

### Avoided Pitfalls
We explicitly avoid adding a mid-tier episodic summarization cascade before Tri-Vector ingestion, as doing so would actively destroy the localized structural Graph markers generated natively inside the agent's `<thought>` and `response` processes.

## Timeline

- 2026-04-11T16:32:32Z @tobiu added the `enhancement` label
- 2026-04-11T16:32:32Z @tobiu added the `ai` label
- 2026-04-11T16:32:33Z @tobiu added the `refactoring` label
- 2026-04-11T16:32:33Z @tobiu added the `architecture` label
- 2026-04-11T16:32:33Z @tobiu added the `core` label
- 2026-04-11T16:35:30Z @tobiu referenced in commit `7f5ec11` - "feat: Harden DreamService memory processing and filesystem ingestion (#9884)"
- 2026-04-11T16:35:47Z @tobiu cross-referenced by PR #9885
- 2026-04-11T16:41:56Z @tobiu closed this issue
- 2026-04-11T16:41:56Z @tobiu referenced in commit `afa5736` - "feat: Harden DreamService memory processing and filesystem ingestion (#9884) (#9885)

* feat: Harden DreamService memory processing and filesystem ingestion (#9884)

* fix: Update openapi.yaml to expose telemetry properties to the add_memory tool shape"
- 2026-04-11T17:06:59Z @tobiu referenced in commit `90f90b5` - "chore: Add AI attribution tracking instruction to ideation sandbox (#9884)"
- 2026-04-11T17:07:27Z @tobiu referenced in commit `2204447` - "chore: Add AI attribution tracking instruction to ideation sandbox (#9884)"

