---
id: 8342
title: Switch Knowledge Base to Source Code Indexing (SourceParser)
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-05T22:57:17Z'
updatedAt: '2026-01-05T23:04:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8342'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-05T23:04:39Z'
---
# Switch Knowledge Base to Source Code Indexing (SourceParser)

Switch the API knowledge source from `docs/output/all.json` (JSDoc JSON) to raw `src/**/*.mjs` files.

**Goal:** Provide the AI with *implementation details* and *context*, not just API signatures. Reduce vector cardinality by grouping cohesive units.

**Plan:**
1.  **Create `ai/mcp/server/knowledge-base/parser/SourceParser.mjs`:**
    *   Use `acorn` to parse `.mjs` files.
    *   **Chunking Strategy:**
        *   **Module Context:** Imports + Module-level variables (e.g., `const symbol = ...`) + Class Header (JSDoc + Class definition).
        *   **Class Properties:** Static and instance fields defined on the class body (e.g., `static observable = true`, `myProp = 0`) excluding the `config` object.
        *   **Config Block:** The entire `static config = { ... }` object as a single chunk.
        *   **Methods:** Individual methods (Body + JSDoc).
    *   **Metadata:** Include line numbers (`line_start`, `line_end`) for future "open in editor" features.

2.  **Update `ApiSource.mjs`:**
    *   Change target from `docs/output/all.json` to `src/`.
    *   Use `SourceParser` for parsing `.mjs` files.
    *   Retain deterministic sorting.

3.  **Cleanup:**
    *   Remove `ApiParser.mjs` (the JSDoc JSON parser).

**Note:** This relies on the `acorn` dependency which is already present (used by `TestParser`).

## Timeline

- 2026-01-05T22:57:19Z @tobiu added the `enhancement` label
- 2026-01-05T22:57:19Z @tobiu added the `ai` label
- 2026-01-05T22:57:35Z @tobiu assigned to @tobiu
- 2026-01-05T23:03:08Z @tobiu referenced in commit `0e0ac53` - "Enhancement: Switch Knowledge Base to Source Code Indexing #8342

Introduced SourceParser.mjs to parse raw ES modules using Acorn, chunking them into Module Context, Class Properties, Config, and Methods. Updated ApiSource.mjs to scan the 'src/' directory and use SourceParser, replacing the previous dependency on JSDoc output. Deleted the obsolete ApiParser.mjs."
### @tobiu - 2026-01-05T23:03:10Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully switched the Knowledge Base indexing strategy from JSDoc JSON to raw Source Code.
> 
> **Changes Implemented:**
> 
> 1.  **Created `SourceParser.mjs`:**
>     *   Uses `acorn` to parse `.mjs` files into an AST.
>     *   **Chunking Strategy:**
>         *   **Module Context:** Captures imports, top-level variables, and the class header (JSDoc + Class Declaration).
>         *   **Class Properties:** Groups static and instance fields (e.g., `static observable`, `myProp = 0`) that are *not* part of the config block.
>         *   **Config Block:** Extracts the entire `static config = { ... }` object as a single, cohesive chunk.
>         *   **Methods:** Extracts individual methods (Body + JSDoc) with line number metadata.
> 
> 2.  **Updated `ApiSource.mjs`:**
>     *   Now targets the `src/` directory instead of `docs/output/all.json`.
>     *   Recursively scans for `.mjs` files.
>     *   Uses `SourceParser` to generate chunks.
>     *   Maintains the previously added deterministic sorting.
> 
> 3.  **Deleted `ApiParser.mjs`:**
>     *   Removed the obsolete parser that relied on `jsdoc-api` output.
> 
> This change upgrades the AI's understanding from purely API-based (signatures and descriptions) to implementation-based (logic and patterns), while also reducing vector cardinality by grouping related configurations.

- 2026-01-05T23:04:39Z @tobiu closed this issue
- 2026-01-08T12:02:19Z @tobiu cross-referenced by #8420

