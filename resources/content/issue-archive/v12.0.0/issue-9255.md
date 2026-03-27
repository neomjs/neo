---
id: 9255
title: Create Backend ("Fat Client") Guide for DevIndex
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-22T17:22:09Z'
updatedAt: '2026-02-22T17:27:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9255'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-22T17:27:42Z'
---
# Create Backend ("Fat Client") Guide for DevIndex

**Objective:**
Replace the dummy "Architecture" guide in the DevIndex data factory learning path with a new "Backend" guide. This guide explains the "Fat Client" twist of the DevIndex application—specifically that it lacks a traditional backend server and instead relies on streaming a static `users.jsonl` file.

**Tasks:**
- Create `learn/guides/devindex/Backend.md`.
- Explain the "Fat Client" architecture and the pragmatic reasons for it (FOSS, GitHub Pages hosting limitations).
- Describe the hyper-optimized NDJSON data format.
- Explain the streaming architecture using `Neo.data.proxy.Stream`, `ReadableStream`, and `progressiveChunkSize`.
- Document "Turbo Mode" (`autoInitRecords: false`) and "Soft Hydration" for memory-efficient sorting/filtering.
- Detail the zero-overhead virtual fields feature using `Neo.data.RecordFactory`.
- Update `learn/guides/devindex/tree.json` to link the new guide.

## Timeline

- 2026-02-22T17:22:10Z @tobiu added the `documentation` label
- 2026-02-22T17:22:11Z @tobiu added the `enhancement` label
- 2026-02-22T17:22:11Z @tobiu added the `ai` label
- 2026-02-22T17:22:28Z @tobiu assigned to @tobiu
- 2026-02-22T17:27:19Z @tobiu referenced in commit `439689b` - "docs: Create Backend guide and replace Architecture dummy (#9255)"
### @tobiu - 2026-02-22T17:27:26Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the creation of the `Backend.md` guide for DevIndex. 
> 
> Key additions:
> - Explained the "Fat Client" architecture and how the `users.jsonl` file acts as the backend.
> - Detailed the pragmatic FOSS and GitHub Pages hosting constraints.
> - Documented the streaming architecture using `Neo.data.proxy.Stream`.
> - Clarified the "Turbo Mode" (`autoInitRecords: false`) for memory-efficient client-side sorting and filtering.
> - Highlighted the zero-overhead virtual fields feature using `Neo.data.RecordFactory`.
> - Updated `tree.json` to link the new guide and replace the "Architecture" dummy.
> 
> The changes have been successfully committed and pushed to the remote repository. Closing this issue.

- 2026-02-22T17:27:42Z @tobiu closed this issue

