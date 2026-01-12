---
id: 8341
title: Robust Knowledge Base Delta Updates (Hash-based IDs + Deterministic Sorting)
state: CLOSED
labels:
  - bug
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-05T22:27:11Z'
updatedAt: '2026-01-05T22:36:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8341'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-05T22:36:57Z'
---
# Robust Knowledge Base Delta Updates (Hash-based IDs + Deterministic Sorting)

The current Knowledge Base embedding logic relies on positional IDs (`id_${index}`) and OS-dependent file ordering (`fs.readdir`).

**The Problem:**
1.  **Indeterminism:** `fs.readdir` returns files in arbitrary order. If the order changes (e.g., different OS), indices shift, causing a full re-embedding.
2.  **Cascading Invalidations:** Inserting a single document shifts the index of all subsequent documents. This forces a re-upload of potentially the entire dataset, defeating the purpose of delta updates.

**The Solution:**
1.  **Hash-based IDs:** Update `VectorService.mjs` to use `chunk.hash` as the ChromaDB Record ID instead of `id_${index}`. This makes IDs content-addressable and position-independent.
2.  **Deterministic Sorting:** Enforce alphabetical sorting in all Source extractors (`ApiSource`, `TicketSource`, `ReleaseNotesSource`, `TestSource`, `LearningSource`). This ensures the generated `ai-knowledge-base.jsonl` file remains stable in Git history.

**Implementation Plan:**
1.  Refactor `VectorService.embed()` to index existing documents by ID (which will now be the hash).
2.  Update Sources to sort files/keys before writing.

## Timeline

- 2026-01-05T22:27:12Z @tobiu added the `bug` label
- 2026-01-05T22:27:12Z @tobiu added the `enhancement` label
- 2026-01-05T22:27:12Z @tobiu added the `ai` label
- 2026-01-05T22:34:22Z @tobiu assigned to @tobiu
- 2026-01-05T22:36:28Z @tobiu referenced in commit `6100d61` - "Enhancement: Robust Knowledge Base Delta Updates #8341

Implemented hash-based IDs for VectorService to eliminate cascading updates on file insertions. Added deterministic sorting to all Source extractors (Api, Ticket, ReleaseNotes, Test) to ensure stable JSONL generation regardless of OS file ordering. Also implemented batched ID fetching in VectorService to support large collections."
### @tobiu - 2026-01-05T22:36:35Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the proposed changes:
> 
> 1.  **VectorService.mjs**:
>     *   Switched from positional IDs (`id_${index}`) to **Hash-based IDs** (`chunk.hash`). This ensures that inserting a new document doesn't invalidate the IDs of all subsequent documents.
>     *   Implemented **batched fetching** (limit: 2000) for retrieving existing IDs from ChromaDB to ensure scalability with large collections (addressing the 10k+ document scenario).
>     *   Simplified the diffing logic to check for hash existence directly.
> 
> 2.  **Source Extractors**:
>     *   **ApiSource.mjs**: Added sorting by `name`.
>     *   **TicketSource.mjs**: Added sorting for both release version directories and ticket files.
>     *   **ReleaseNotesSource.mjs**: Added sorting for release note files.
>     *   **TestSource.mjs**: Added sorting for directory entries.
> 
> These changes ensure that the Knowledge Base generation is deterministic and that updates are true deltas, minimizing unnecessary re-embeddings.

- 2026-01-05T22:36:57Z @tobiu closed this issue

