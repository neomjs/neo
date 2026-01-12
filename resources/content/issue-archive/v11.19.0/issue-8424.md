---
id: 8424
title: Fix SourceParser to resolve fully qualified superclass names
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-08T13:25:42Z'
updatedAt: '2026-01-08T13:27:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8424'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T13:27:11Z'
---
# Fix SourceParser to resolve fully qualified superclass names

The `SourceParser` currently extracts the local identifier for the parent class (e.g., `extends Base`), which results in broken links in the class hierarchy map.

**Task:**
Refactor `ai/mcp/server/knowledge-base/parser/SourceParser.mjs` to:
1.  Capture a map of imports (Local Name -> Import Path).
2.  When a class `extends X`, look up `X` in the import map.
3.  Resolve the import path relative to the current file path.
4.  Convert the resolved file path into a fully qualified Neo class name (e.g., `src/container/Base.mjs` -> `Neo.container.Base`).

**Heuristic:**
- Assume `src/` maps to `Neo.`.
- Assume `apps/` maps to `App.` (or use the app name from the path).
- Handle relative paths (`../`, `./`) using the `path` module (requires importing `path`).

**Goal:**
The `extends` property in the chunk metadata should be a fully qualified class name (e.g., `Neo.container.Base`) whenever possible.

## Timeline

- 2026-01-08T13:25:43Z @tobiu added the `bug` label
- 2026-01-08T13:25:44Z @tobiu added the `ai` label
- 2026-01-08T13:26:04Z @tobiu assigned to @tobiu
- 2026-01-08T13:26:46Z @tobiu referenced in commit `3bda6e5` - "fix: Resolve fully qualified superclass name in SourceParser (#8424)"
### @tobiu - 2026-01-08T13:26:58Z

**Input from Gemini 3 Pro:**

> ✦ I have updated `SourceParser.mjs` to resolve the fully qualified `superClass` name.
> 
> **Logic Implemented:**
> 1.  **Import Mapping:** The parser now scans `ImportDeclaration` nodes and builds a map of `localName` -> `importPath`.
> 2.  **Resolution:** When a class extends a local identifier (e.g., `extends Container`), the parser:
>     *   Looks up the import path for `Container` (e.g., `../../container/Base.mjs`).
>     *   Resolves this relative to the current file path (`src/tab/header/Toolbar.mjs` + `../../container/Base.mjs` -> `src/container/Base.mjs`).
>     *   Converts the resolved path into a Neo class namespace (`Neo.container.Base`) using standard conventions.
> 
> This ensures the `extends` metadata in the knowledge base (and thus the `ai-class-hierarchy.json`) points to valid, unique class keys rather than ambiguous local names.

- 2026-01-08T13:27:11Z @tobiu closed this issue

