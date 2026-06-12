---
id: 8065
title: Enhance Source Code with Intent-Driven Documentation
state: CLOSED
labels:
  - documentation
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-09T01:19:58Z'
updatedAt: '2025-12-09T01:28:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8065'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-09T01:28:02Z'
---
# Enhance Source Code with Intent-Driven Documentation

Apply the "Knowledge Base Enhancement Strategy" to the recently refactored and touched files to improve discoverability and AI context.

**Files to Enhance:**
1.  `src/code/LivePreview.mjs`
2.  `src/code/renderer/Base.mjs`
3.  `src/code/renderer/Neo.mjs`
4.  `src/code/renderer/Markdown.mjs`
5.  `apps/portal/view/learn/ContentComponent.mjs`

**Action Plan:**
1.  **Analyze**: Review each file to identify key mechanisms, architectural roles, and patterns.
2.  **Document**: Add structured JSDoc comments to classes and key methods using the `@summary` tag and detailed descriptions.
3.  **Semantic Signposting**: Explicitly mention relevant concepts (e.g., `pluggable renderer`, `dynamic import`, `markdown parsing`) to aid future queries.

**Goal:**
Ensure the new renderer architecture is well-documented for both human developers and future AI sessions.

## Timeline

- 2025-12-09T01:19:59Z @tobiu added the `documentation` label
- 2025-12-09T01:19:59Z @tobiu added the `ai` label
- 2025-12-09T01:19:59Z @tobiu added the `refactoring` label
- 2025-12-09T01:26:57Z @tobiu assigned to @tobiu
- 2025-12-09T01:27:25Z @tobiu referenced in commit `5f3317d` - "Enhance Source Code with Intent-Driven Documentation #8065"
### @tobiu - 2025-12-09T01:27:54Z

**Input from Gemini:**

> ✦ Enhancement complete.
> 
> **Documentation Updates:**
> 1.  **`src/code/LivePreview.mjs`**:
>     *   **Class**: Documented the pluggable renderer architecture, dynamic imports, and component features.
>     *   **`loadRenderer`**: Explained the lazy-loading strategy and caching mechanism for performance.
>     *   **`doRunSource`**: Detailed the execution orchestration (validation, cleanup, delegation, state update).
> 
> 2.  **`src/code/renderer/Base.mjs`**:
>     *   **Class**: Defined its role as the abstract Strategy interface for polymorphism.
> 
> 3.  **`src/code/renderer/Neo.mjs`**:
>     *   **Class**: Documented its role in executing Neo.mjs code dynamically.
>     *   **`render`**: Detailed the complex logic for import rewriting, environment-aware path adjustments, sandbox execution via `new Function`, and namespace cache clearing for HMR.
> 
> 4.  **`src/code/renderer/Markdown.mjs`**:
>     *   **Class**: Described the extended Markdown processing capabilities.
>     *   **`render`**: Explained the multi-pass pipeline (Extraction -> Highlighting -> Parsing -> Injection) required to handle mixed content (static markdown + dynamic components) and async highlighting.
> 
> 5.  **`apps/portal/view/learn/ContentComponent.mjs`**:
>     *   **Class**: Clarified its responsibility as the documentation viewer and delegator to the Markdown renderer.
> 
> Intent-driven comments explaining the "why" behind key architectural decisions have been applied.

- 2025-12-09T01:28:02Z @tobiu closed this issue

