---
id: 9248
title: 'Add DevIndex Data Factory Guide: Updater Service'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-22T12:49:17Z'
updatedAt: '2026-02-22T13:03:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9248'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-22T13:02:47Z'
---
# Add DevIndex Data Factory Guide: Updater Service

The `Updater.mjs` service is the most complex component of the DevIndex pipeline. We need comprehensive documentation to explain its workflow, error handling, and data enrichment strategies.

Tasks:
- Create `learn/guides/devindex/data-factory/Updater.md` covering `Updater.mjs`.
- Explain the core workflow: Fetch -> Enrich -> Filter (Meritocracy Logic) -> Persist.
- Document the "Safe Purge Protocol" (Self-Healing) for handling transient vs. fatal errors.
- Explain the complex GraphQL batching strategy for multi-year contribution histories and the fallback mechanisms for `502`/`504` errors.
- Include Mermaid diagrams to illustrate the batch processing flow and error handling logic.
- Provide code snippets to clarify critical sections (e.g., rate limit checks, rename recovery).
- Update `learn/guides/devindex/tree.json` to include the new guide.

## Timeline

- 2026-02-22T12:49:19Z @tobiu added the `documentation` label
- 2026-02-22T12:49:19Z @tobiu added the `epic` label
- 2026-02-22T12:49:19Z @tobiu added the `ai` label
- 2026-02-22T12:49:44Z @tobiu assigned to @tobiu
- 2026-02-22T12:58:57Z @tobiu referenced in commit `1817d5e` - "docs: Add Data Factory guide for Updater Service (#9248)"
### @tobiu - 2026-02-22T12:59:13Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the tasks outlined in this issue:
> - Created `learn/guides/devindex/data-factory/Updater.md` covering the `Updater.mjs` service.
> - Documented the Fetch, Enrich, Filter, and Persist core workflows, including the complex GraphQL chunking mechanism.
> - Explained the "Safe Purge Protocol" for handling renaming, bad seeds, and transient errors, complete with a flow diagram.
> - Included the "Checkpointing & State Persistence" section to explain how data integrity is maintained using `saveInterval`.
> - Illustrated the flows using structured `mermaid` diagrams.
> - Updated `learn/guides/devindex/tree.json` to include the new Updater guide.
> 
> The changes have been committed and pushed to the `dev` branch. I will now close this issue.

- 2026-02-22T13:01:42Z @tobiu referenced in commit `0cf446d` - "docs: Add profile query snippet to Updater guide for transparency (#9248)"
- 2026-02-22T13:02:47Z @tobiu closed this issue
- 2026-02-22T13:03:02Z @tobiu removed the `epic` label
- 2026-02-22T13:03:02Z @tobiu added the `enhancement` label

