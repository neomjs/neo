---
id: 9249
title: 'Add DevIndex Data Factory Guide: Data Enrichment Utilities'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-02-22T13:05:26Z'
updatedAt: '2026-02-22T13:08:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9249'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-22T13:08:14Z'
---
# Add DevIndex Data Factory Guide: Data Enrichment Utilities

The `Heuristics.mjs` and `LocationNormalizer.mjs` services provide critical data enrichment during the Updater phase. While the high-level concepts are mentioned in `Methodology.md`, the technical implementation details—such as the median calculation for acceleration or the regex boundary logic for locations—belong in the `data-factory` engineering documentation.

Tasks:
- Create `learn/guides/devindex/data-factory/DataEnrichment.md`.
- Document the specific mathematical implementation in `Heuristics.mjs` (Velocity, Acceleration, Consistency).
- Document the pattern matching and fallback strategies in `LocationNormalizer.mjs`.
- Update `learn/guides/devindex/tree.json` to include the new guide under the Data Factory section.

## Timeline

- 2026-02-22T13:05:27Z @tobiu added the `documentation` label
- 2026-02-22T13:05:27Z @tobiu added the `ai` label
- 2026-02-22T13:05:57Z @tobiu assigned to @tobiu
- 2026-02-22T13:07:22Z @tobiu referenced in commit `f871095` - "docs: Add Data Factory guide for Data Enrichment Utilities (#9249)"
### @tobiu - 2026-02-22T13:07:56Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the tasks for this issue:
> - Created the new technical guide `learn/guides/devindex/data-factory/DataEnrichment.md`.
> - Documented the mathematical implementation of the Heuristics Engine (Velocity, Acceleration, Consistency), explicitly explaining the use of the median baseline for calculating acceleration.
> - Documented the multi-tiered parsing strategy of the Location Normalizer, detailing the regex boundary matching, the US State abbreviation collision handling, and the fallback city map.
> - Updated `learn/guides/devindex/tree.json` to insert the new guide into the Data Factory section.
> 
> The code has been committed and pushed to the `dev` branch. Closing this issue.

- 2026-02-22T13:08:14Z @tobiu closed this issue

