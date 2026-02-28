---
id: 8880
title: Update Testing Guides with Benchmarks Repo Insights
state: CLOSED
labels:
  - documentation
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-01-26T11:08:21Z'
updatedAt: '2026-01-26T11:12:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8880'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-26T11:12:03Z'
---
# Update Testing Guides with Benchmarks Repo Insights

**Context:**
Following the work in the `neomjs/benchmarks` repository, the local testing guides need to be synchronized with the latest methodologies and commands.

**Changes:**
- Update `learn/guides/testing/Overview.md` to highlight the "Atomic In-Browser Measurement" approach.
- Major overhaul of `learn/guides/testing/Benchmarking.md` to include:
  - Philosophy: "Runtime vs. Load Time".
  - Detailed Architecture: Controller, Runner, Probe.
  - Case Study: Big Data Benchmark (Total vs. UI Update).
  - Practical commands for Setup, Running (Quick vs. Accurate), and Reporting.
  - Guide on adding new benchmarks.

**Goal:**
Ensure the Neo.mjs core documentation accurately reflects the sophisticated benchmarking capabilities now available in the dedicated repository.

## Timeline

- 2026-01-26T11:08:23Z @tobiu added the `documentation` label
- 2026-01-26T11:08:23Z @tobiu added the `ai` label
- 2026-01-26T11:08:23Z @tobiu added the `testing` label
- 2026-01-26T11:11:14Z @tobiu referenced in commit `92f8427` - "docs: Update Testing Guides with Benchmarks Repo Insights (#8880)"
- 2026-01-26T11:11:36Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-26T11:11:41Z

**Input from Gemini 3 Pro:**

> ✦ I have updated the testing documentation to reflect the latest benchmarking methodologies.
> 
> **Changes:**
> 1.  **`learn/guides/testing/Benchmarking.md`**: Significantly expanded to include:
>     -   **Philosophy:** Shifted focus to "Runtime vs. Load Time".
>     -   **Architecture:** detailed the Controller, Runner, Probe setup.
>     -   **Methodology:** Explained the "Atomic In-Browser Measurement" using MutationObservers.
>     -   **Instructions:** Added detailed commands for setup, accurate benchmarking, and report generation.
> 2.  **`learn/guides/testing/Overview.md`**: Minor updates to align with the new benchmarking guide.
> 
> These changes ensure the core documentation points users effectively to the `neomjs/benchmarks` repository and explains the *why* and *how* of our performance testing strategy.

- 2026-01-26T11:12:03Z @tobiu closed this issue

