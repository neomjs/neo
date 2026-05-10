---
id: 8063
title: Refactor LivePreview to use Pluggable Renderers
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-09T00:25:24Z'
updatedAt: '2025-12-09T01:26:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8063'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-09T01:26:42Z'
---
# Refactor LivePreview to use Pluggable Renderers

Extract code rendering logic from `Neo.code.LivePreview` and markdown logic from `Portal.view.learn.ContentComponent` into dedicated renderer classes.

**Goal:**
Enable `Neo.code.LivePreview` to support multiple languages (Neo.mjs code execution, Markdown rendering) via a pluggable renderer system.

**Changes:**
1.  **Create `src/code/renderer/Base.mjs`**: Abstract base class for renderers.
2.  **Create `src/code/renderer/Neo.mjs`**: Encapsulates logic for `doRunSource`, `findClassNames`, etc.
3.  **Create `src/code/renderer/Markdown.mjs`**: Encapsulates logic for `marked` parsing, `HighlightJS` processing, and custom block extraction.
4.  **Refactor `Neo.code.LivePreview`**:
    *   Add `language` config (enum: 'neomjs', 'markdown').
    *   Add `renderer` reactive config (instance of renderer).
    *   Update `afterSetLanguage` to dynamically import and instantiate the correct renderer.
    *   Delegate execution/rendering to the active renderer.
5.  **Refactor `Portal.view.learn.ContentComponent`**:
    *   Use `src/code/renderer/Markdown.mjs` to parse content, removing duplication.

## Timeline

- 2025-12-09T00:25:25Z @tobiu added the `enhancement` label
- 2025-12-09T00:25:25Z @tobiu added the `ai` label
- 2025-12-09T00:25:26Z @tobiu added the `refactoring` label
- 2025-12-09T00:25:26Z @tobiu added the `architecture` label
- 2025-12-09T00:49:45Z @tobiu assigned to @tobiu
- 2025-12-09T00:50:44Z @tobiu referenced in commit `c3b9bc0` - "Refactor LivePreview to use Pluggable Renderers #8063"
### @tobiu - 2025-12-09T00:53:36Z

**Input from Gemini:**

> ✦ Refactoring complete.
> 
> **Changes:**
> 1.  **Pluggable Renderer Architecture:**
>     *   Created `src/code/renderer/Base.mjs` (Abstract Base).
>     *   Created `src/code/renderer/Neo.mjs` (Neo.mjs code execution).
>     *   Created `src/code/renderer/Markdown.mjs` (Markdown parsing/rendering).
> 
> 2.  **`Neo.code.LivePreview` Update:**
>     *   Now uses `language_` ('neomjs' | 'markdown') and `renderer_` configs.
>     *   Dynamic import of renderers.
>     *   Delegates execution to the active renderer.
> 
> 3.  **`Portal.view.learn.ContentComponent` Update:**
>     *   Refactored to use `Neo.code.renderer.Markdown`, eliminating code duplication.
> 
> 4.  **Path Resolution Fix:**
>     *   Adjusted relative path resolution in `Neo.mjs` renderer for `development` environment to account for the new file location.
> 
> Verified by user in devmode (standalone and learning section).

- 2025-12-09T01:26:42Z @tobiu closed this issue

