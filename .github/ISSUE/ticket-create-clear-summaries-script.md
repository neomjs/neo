---
title: Create `clearSummaries.mjs` script for development
labels: enhancement, AI
---

GH ticket id: #7363

**Epic:** AI Knowledge Evolution
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

During development and testing of the session summarization feature, a utility script was needed to quickly clear out the session summaries collection in ChromaDB. This ticket documents the creation of this helper script.

## Acceptance Criteria

1.  A new script `buildScripts/ai/clearSummaries.mjs` is created.
2.  The script connects to the ChromaDB instance defined in `aiConfig.mjs`.
3.  It deletes and immediately recreates the `sessions` collection.
4.  The script is intended for development use and will not be added to `package.json` scripts.
