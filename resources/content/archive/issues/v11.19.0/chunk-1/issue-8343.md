---
id: 8343
title: 'Expand Source Indexing Coverage (Apps, Examples, AI)'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-05T23:10:08Z'
updatedAt: '2026-01-05T23:24:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8343'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-05T23:24:39Z'
---
# Expand Source Indexing Coverage (Apps, Examples, AI)

Expand the `ApiSource` to index additional directories that were previously covered (or are newly desired).
Implement category differentiation based on the source directory.

**Directories & Types:**
*   `src/` -> `type: 'src'` (Core Framework)
*   `apps/` -> `type: 'app'` (Reference Applications)
*   `examples/` -> `type: 'example'` (Usage Examples)
*   `docs/app/` -> `type: 'app'` (Docs App)
*   `ai/` -> `type: 'ai-infrastructure'` (Agent OS / Node.js)

**Implementation:**
1.  Update `SourceParser.mjs` to accept a `defaultType` argument in its `parse` method (defaulting to 'src').
2.  Update `ApiSource.mjs` to:
    *   Iterate over the defined path-to-type map.
    *   Recursively index each path.
    *   Pass the corresponding type to `SourceParser`.

## Timeline

- 2026-01-05T23:10:09Z @tobiu added the `enhancement` label
- 2026-01-05T23:10:09Z @tobiu added the `ai` label
- 2026-01-05T23:10:24Z @tobiu assigned to @tobiu
- 2026-01-05T23:18:45Z @tobiu referenced in commit `c1a0f7a` - "Enhancement: Expand Source Indexing Coverage #8343

Updated SourceParser to accept a 'defaultType' parameter for dynamic categorization. Refactored ApiSource to iterate over multiple root directories ('src', 'apps', 'examples', 'docs/app', 'ai') and assign specific categories ('src', 'app', 'example', 'ai-infrastructure'), ensuring comprehensive and semantically typed knowledge base coverage."
### @tobiu - 2026-01-05T23:18:58Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully expanded the Source Indexing scope and implemented category differentiation.
> 
> **Changes Implemented:**
> 
> 1.  **Updated `SourceParser.mjs`:**
>     *   The `parse` method now accepts an optional `defaultType` parameter.
>     *   This type is applied to all generated chunks (`module-context`, `class-properties`, `class-config`, `method`), enabling the database to distinguish between framework code, examples, and infrastructure.
> 
> 2.  **Refactored `ApiSource.mjs`:**
>     *   Removed the single `srcPath` config.
>     *   Introduced a mapping of source roots to their semantic types:
>         *   `src/` -> `src` (Core Framework)
>         *   `apps/` -> `app` (Reference Applications)
>         *   `examples/` -> `example` (Usage Examples)
>         *   `docs/app/` -> `app` (Docs App)
>         *   `ai/` -> `ai-infrastructure` (Agent OS)
>     *   The `extract` method now iterates over these roots, recursively indexing each with the correct type.
>     *   Added a safety check to skip `node_modules` during recursion.
> 
> This ensures the Knowledge Base now contains a comprehensive, categorized view of the entire codebase, from the core framework to the AI infrastructure.

- 2026-01-05T23:24:40Z @tobiu closed this issue

