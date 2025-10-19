---
title: "Standardize ChromaDB Collection Naming Convention"
labels: enhancement, AI
---

GH ticket id: #7563

**Epic:** #7536
**Phase:** 3
**Assignee:** tobiu
**Status:** Done

## Description

The ChromaDB collection names in `ai/mcp/server/config.mjs` use inconsistent separators. The `memoryCore` collections use a hyphen (`neo-agent-memory`), while the `knowledgeBase` collection uses an underscore (`neo_knowledge`).

To standardize our naming convention, the `knowledgeBase.collectionName` should be updated to use a hyphen.

## Acceptance Criteria

1.  In `ai/mcp/server/config.mjs`, the `knowledgeBase.collectionName` property is changed from `'neo_knowledge'` to `'neo-knowledge-base'`.
2.  Any services that might have this value hardcoded (though they should not) are checked and updated.
3.  This change implies that the old collection will be orphaned and a new one will be created on the next sync, which is the desired outcome for a clean switch.
