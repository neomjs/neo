---
id: 8879
title: 'Restructure Testing Documentation (Phase 2: Overview & Benchmarking)'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-01-26T10:33:55Z'
updatedAt: '2026-01-26T10:35:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8879'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-26T10:35:36Z'
---
# Restructure Testing Documentation (Phase 2: Overview & Benchmarking)

Complete the testing documentation restructuring by adding the Overview and Benchmarking guides.

**Tasks:**
1.  **Create `learn/guides/testing/Overview.md`**:
    -   Provide a high-level summary of the three testing pillars: Unit (Logic), Component (Visual), and Benchmarking (Performance).
    -   Link to the respective in-depth guides.
2.  **Create `learn/guides/testing/Benchmarking.md`**:
    -   Explain the "Resilience" philosophy (Parallelism Trap, Atomic Measurement, etc.).
    -   Explain **why** benchmarks live in a separate repo (avoiding dependency pollution from React/Angular/AG-Grid).
    -   Link to the `neomjs/benchmarks` repository.
3.  **Update `learn/tree.json`**:
    -   Add the new guides to the navigation tree.

**Goal:** Provide a complete, structured testing documentation landscape.

## Timeline

- 2026-01-26T10:33:56Z @tobiu added the `documentation` label
- 2026-01-26T10:33:56Z @tobiu added the `ai` label
- 2026-01-26T10:35:01Z @tobiu referenced in commit `1c85abe` - "docs: Add Overview and Benchmarking guides (#8879)"
### @tobiu - 2026-01-26T10:35:14Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the second phase of the testing documentation restructuring.
> 
> **Changes:**
> 1.  **Created:** `learn/guides/testing/Overview.md`
>     -   Serves as the high-level entry point.
>     -   Clearly distinguishes between Unit (Logic), Component (Visual), and Benchmark (Performance) testing.
> 2.  **Created:** `learn/guides/testing/Benchmarking.md`
>     -   Outlines the core philosophy: Resilience vs. Page Load.
>     -   Explains the key technical challenges: Parallelism, Latency, and Polling.
>     -   Explicitly states the reason for the separate repository (dependency isolation from React/Angular/AG-Grid).
> 3.  **Updated:** `learn/tree.json`
>     -   Added the new guides to the navigation.
> 
> The testing documentation is now structurally complete. The `Benchmarking.md` guide currently serves as a strong conceptual placeholder, directing users to the dedicated repository for execution details.

- 2026-01-26T10:35:22Z @tobiu assigned to @tobiu
- 2026-01-26T10:35:36Z @tobiu closed this issue

