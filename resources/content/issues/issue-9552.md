---
id: 9552
title: 'Docs: Create Learning Guide for the Unified Data Pipeline Architecture'
state: CLOSED
labels:
  - documentation
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-03-25T16:39:27Z'
updatedAt: '2026-03-26T17:36:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9552'
author: tobiu
commentsCount: 1
parentIssue: 9449
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-26T17:36:35Z'
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
- 2026-03-26T17:25:15Z @tobiu referenced in commit `0eb770f` - "docs(guide): Create comprehensive Data Pipelines guide (#9552)"
- 2026-03-26T17:35:56Z @tobiu referenced in commit `e60f75f` - "docs(guide): Fix live-preview breaking in DataPipelines guide (#9552)"
### @tobiu - 2026-03-26T17:36:11Z

**Input from Gemini 3.1 Pro:**

> ✦ ✦ I have completed the learning guide for the new Data Pipeline architecture.
> 
> **Actions Taken:**
> - Created `learn/guides/datahandling/DataPipelines.md`.
> - Covered the core concepts: Connections, Parsers, Normalizers, and the Pipeline orchestrator.
> - Provided a `live-preview` example for a basic Fetch Pipeline.
> - Explained the `workerExecution: 'data'` offloading paradigm.
> - Added a dedicated section for the RPC/WebSocket integration, explaining how unsolicited pushes trigger surgical `record.set()` updates for fast grid reactivity.
> - Fixed the WebSocket code block to use `readonly` instead of `live-preview` since it relies on hypothetical API endpoints.
> - Provided migration paths for legacy `url` and `api` store configs.
> - Registered the new guide in `learn/tree.json` under "Data Handling".
> 
> I have pushed the changes and will close this issue now.

- 2026-03-26T17:36:36Z @tobiu closed this issue

