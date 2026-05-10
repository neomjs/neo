---
id: 9133
title: Tune Spider Strategy Probabilities and Enhance Documentation
state: CLOSED
labels:
  - documentation
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-13T01:45:33Z'
updatedAt: '2026-02-13T01:48:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9133'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-13T01:48:42Z'
---
# Tune Spider Strategy Probabilities and Enhance Documentation

We are tuning the Spider's discovery probability distribution to prioritize the new "Network Walker" strategy. Since the repository search space is becoming saturated (15k users found), traversing the social graph of these qualified users is now the highest-yield strategy.

**Changes:**
1.  **Rebalance Probabilities:**
    -   **Network Walker:** Increase from ~15% to **~30%**.
    -   **High Stars:** Decrease from ~30% to **~25%**.
    -   **Bio Signals / Community:** Decrease to **~5%**.
    -   **Stargazer:** Decrease to **~5%**.
2.  **Knowledge Base Enhancement:** Add rich, intent-driven JSDoc to `Spider.mjs` explaining the "Filter Bubble" problem and why the Network Walker is the solution for the current stage of the index.

This shift marks a transition from "Breadth-First Repository Scanning" to "Depth-First Network Traversal".

## Timeline

- 2026-02-13T01:45:34Z @tobiu added the `documentation` label
- 2026-02-13T01:45:34Z @tobiu added the `ai` label
- 2026-02-13T01:45:34Z @tobiu added the `refactoring` label
- 2026-02-13T01:45:49Z @tobiu added parent issue #9106
- 2026-02-13T01:45:53Z @tobiu assigned to @tobiu
- 2026-02-13T01:48:06Z @tobiu referenced in commit `b4fee22` - "feat(devindex): Tune spider strategies & prioritize network walker (#9133)"
### @tobiu - 2026-02-13T01:48:18Z

**Input from Gemini 3 Pro:**

> ✦ I have tuned the Spider's strategy probabilities and enhanced the documentation.
> 
> **Changes:**
> 1.  **Rebalanced Probabilities:**
>     -   **Network Walker:** **30%** (Primary)
>     -   **High Stars:** **25%**
>     -   **Keyword:** **20%**
>     -   **Temporal:** **15%**
>     -   **Community/Bio:** **5%**
>     -   **Stargazer:** **5%**
> 2.  **CLI Update:** Added "🕸️ Network Walker" to the interactive menu in `Manager.mjs`.
> 3.  **Documentation:** Added intent-driven JSDoc to `Spider.mjs` explaining the "Filter Bubble" problem and the strategic shift to Depth-First traversal.
> 
> This configuration positions the "Network Walker" as the primary engine for discovering high-quality candidates beyond the saturated top-repo layer.

- 2026-02-13T01:48:42Z @tobiu closed this issue

