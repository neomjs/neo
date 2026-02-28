---
id: 9269
title: 'Create DevIndex Guide: Data Scientists & Researchers'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-23T17:13:39Z'
updatedAt: '2026-02-23T18:05:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9269'
author: tobiu
commentsCount: 2
parentIssue: 9267
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-23T18:05:29Z'
---
# Create DevIndex Guide: Data Scientists & Researchers

**Objective:** Create a guide for researchers on how to leverage the DevIndex dataset (`users.jsonl`).
**Key Points:**
- Explain the rich data structure (the multi-year contribution matrices).
- Detail how the heuristic badges are calculated mathematically.
- Highlight specific research use cases: studying the impact of AI on commit ratios (e.g., changes post-2022) or analyzing the sustainability and "bus factor" of the open-source ecosystem.
- Emphasize that this is a free, high-quality, open-data goldmine.

## Timeline

- 2026-02-23T17:13:40Z @tobiu added the `documentation` label
- 2026-02-23T17:13:41Z @tobiu added the `enhancement` label
- 2026-02-23T17:13:41Z @tobiu added the `ai` label
- 2026-02-23T17:14:11Z @tobiu added parent issue #9267
- 2026-02-23T17:14:25Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-23T17:19:09Z

**Input from Gemini 3.1 Pro:**

> ✦ **Note for future agent session:** 
> Before starting work on this guide, you **MUST** read the following existing documentation as critical context:
> - `learn/guides/devindex/Backend.md` (To understand the minified JSONL keys and streaming format)
> - `learn/guides/devindex/data-factory/DataEnrichment.md` (To understand the mathematical tier system for Location Normalization and heuristic formulas)

- 2026-02-23T18:05:01Z @tobiu referenced in commit `4c34a89` - "docs: Create DevIndex Persona Guide for Data Scientists (#9269)"
### @tobiu - 2026-02-23T18:05:15Z

**Input from Gemini 3.1 Pro:**

> ✦ I've completed and committed the Persona Guide for Data Scientists & Researchers.
> 
> The guide covers:
> - How to access the `users.jsonl` static dataset and decode the minified keys (`tc`, `fy`, `y`, `cy`, `py`).
> - The value of the Multi-Year Contribution Matrices for longitudinal studies.
> - Detailed explanations of the "Cyborg Metrics" (`hm.v`, `hm.a`, `hm.c`) for algorithmic anomaly detection and segmentation (e.g., separating bots from humans).
> - Specific research use case examples, including studying Generative AI's impact on commit ratios, the "Bus Factor" in open source, developer burnout trajectories, and macro-economic geographic disparities.
> 
> Closing this ticket as the guide is now merged and linked in `tree.json`.

- 2026-02-23T18:05:29Z @tobiu closed this issue

