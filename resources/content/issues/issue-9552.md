---
id: 9552
title: 'Docs: Create Learning Guide for the Unified Data Pipeline Architecture'
state: OPEN
labels:
  - documentation
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-03-25T16:39:27Z'
updatedAt: '2026-03-25T16:39:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9552'
author: tobiu
commentsCount: 0
parentIssue: 9449
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Docs: Create Learning Guide for the Unified Data Pipeline Architecture

### Goal
Write a new Markdown guide for the `learn/` section that explains the new `Pipeline -> Connection -> Parser -> Normalizer` architecture.

### Description
The recent refactoring of the data layer introduces a unified pipeline that merges local data fetching (Fetch/XHR) and the RPC API. We need a comprehensive guide to explain this architectural shift to developers.

The guide should:
1.  **Explain the Concepts:** Define what Pipelines, Connections, Parsers, and Normalizers do in the new architecture.
2.  **Highlight the "Merged Universe":** Explain how Stores and the RPC API now share the same underlying pipeline mechanism.
3.  **Provide Live Previews:** Include several ````javascript live-preview```` blocks showcasing:
    *   Simple Fetch/XHR pipelines.
    *   RPC Connection pipelines.
    *   App Worker vs. Data Worker execution.
    *   Small Grids (a few rows/cols) demonstrating data binding.
4.  **Migration Paths:** Briefly touch upon how legacy `api` or `url` configurations map to the new pipeline structure.

This guide will be crucial for onboarding and adoption of the new data layer.

## Timeline

- 2026-03-25T16:39:27Z @tobiu assigned to @tobiu
- 2026-03-25T16:39:28Z @tobiu added the `documentation` label
- 2026-03-25T16:39:28Z @tobiu added the `ai` label
- 2026-03-25T16:39:28Z @tobiu added the `core` label
- 2026-03-25T16:40:36Z @tobiu added parent issue #9449

