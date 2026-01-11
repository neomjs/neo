---
id: 8421
title: Implement Static Class Hierarchy in Knowledge Base
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-08T12:09:44Z'
updatedAt: '2026-01-08T12:14:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8421'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T12:14:55Z'
---
# Implement Static Class Hierarchy in Knowledge Base

The Knowledge Base currently lacks a structured, deterministic way to discover class relationships (e.g., "What classes extend `Neo.component.Base`?"). While `inspect_class` exists in the Neural Link, it only works for *loaded* runtime classes.

**Goal:**
Create a static "Class Hierarchy" map during the Knowledge Base build process and expose it via a tool.

**Tasks:**
1.  **Update `VectorService.mjs`:**
    *   During `embed()`, when building the `classNameToDataMap` for inheritance boosting, save this map (or a simplified tree) to `dist/ai-class-hierarchy.json`.
2.  **Update `QueryService.mjs`:**
    *   Add a `getClassHierarchy({root})` method that reads this JSON file.
    *   Implement logic to return the subtree starting at `root` (or the whole tree).
3.  **Update `openapi.yaml`:**
    *   Expose `get_class_hierarchy` as a tool.

**Value:**
Allows agents to deterministically discover available components and classes in the codebase without relying on fuzzy vector search.

## Timeline

- 2026-01-08T12:09:45Z @tobiu added the `enhancement` label
- 2026-01-08T12:09:45Z @tobiu added the `ai` label
- 2026-01-08T12:10:14Z @tobiu assigned to @tobiu
- 2026-01-08T12:14:23Z @tobiu referenced in commit `9a21928` - "feat: Add Static Class Hierarchy tool to Knowledge Base (#8421)"
### @tobiu - 2026-01-08T12:14:32Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the Static Class Hierarchy tool.
> 
> **Changes:**
> 1.  **`ai/mcp/server/knowledge-base/config.mjs`:** Added `hierarchyPath` to the default configuration.
> 2.  **`VectorService.mjs`:** Updated `embed()` to save the `classNameToDataMap` to `dist/ai-class-hierarchy.json`.
> 3.  **`QueryService.mjs`:** Added `getClassHierarchy()` method to retrieve the hierarchy map.
> 4.  **`openapi.yaml`:** Exposed `get_class_hierarchy` as a new tool.
> 
> This allows agents to deterministically inspect the inheritance tree without needing to guess or rely on runtime introspection.

- 2026-01-08T12:14:55Z @tobiu closed this issue

