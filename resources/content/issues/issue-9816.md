---
id: 9816
title: '[Epic] Agent OS Architecture: Decouple DreamService & Implement Guide Gap Inference'
state: CLOSED
labels:
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2026-04-09T11:06:35Z'
updatedAt: '2026-04-09T11:39:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9816'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 9817 Extract DreamService to standalone background daemon'
  - '[x] 9818 Implement Vector Fast-Fail Guide Gap Analysis in DreamService'
subIssuesCompleted: 2
subIssuesTotal: 2
blockedBy: []
blocking: []
closedAt: '2026-04-09T11:39:45Z'
---
# [Epic] Agent OS Architecture: Decouple DreamService & Implement Guide Gap Inference

This epic tracks the architectural transformation of `DreamService` from a memory-coupled utility into an independent Agent OS daemon, followed by the implementation of Semantic Guide Gap Analysis outlined in discussion-9739.

### Goal 1: Decoupling
Extract `DreamService` and `runSandman.mjs` to operate as an independent orchestrator daemon to restore purity to the `memory-core` MCP server.

### Goal 2: Gap Inference
Implement "Vector Fast-Fail" logic to cross-reference Graph component achievements with ChromaDB Guides to identify missing conceptual documentation (Guide Gaps) without excessive multi-agent token burn.

## Timeline

- 2026-04-09T11:06:37Z @tobiu added the `epic` label
- 2026-04-09T11:06:37Z @tobiu added the `ai` label
- 2026-04-09T11:06:52Z @tobiu added sub-issue #9817
- 2026-04-09T11:06:54Z @tobiu added sub-issue #9818
- 2026-04-09T11:39:43Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-09T11:39:44Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ Epic Complete.
> Both sub-issues have been successfully implemented and linked.
> 
> - **#9817:** `DreamService` was successfully extracted as a background daemon, decoupling orchestrations from the single-threaded MCP server node.
> - **#9818:** Natively imported the Knowledge Base `QueryService` to execute Fast-Fail vector lookups against node concepts, validating outputs via Gemma semantics to detect missing `Guide` entries natively without database or hallucination artifacts.
> 
> The A2A autonomous pipeline expands correctly.

- 2026-04-09T11:39:46Z @tobiu closed this issue

