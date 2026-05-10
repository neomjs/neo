---
id: 9270
title: 'Create DevIndex Guide: Policy Makers & Gov Funding'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-23T17:13:41Z'
updatedAt: '2026-02-23T18:22:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9270'
author: tobiu
commentsCount: 2
parentIssue: 9267
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-23T18:22:00Z'
---
# Create DevIndex Guide: Policy Makers & Gov Funding

**Objective:** Expand on the "Macro-Economic Analysis" to target policymakers looking to fund digital infrastructure.
**Key Points:**
- Provide a guide on how to filter by country to visualize the disparity between open-source consumption and production.
- Provide hard, empirical data comparing outputs across regions (US, UK, Germany, India, China).
- Use this data to justify the need for national and institutional FOSS infrastructure funding, demonstrating the massive unpaid labor currently driving the global software economy.

## Timeline

- 2026-02-23T17:13:43Z @tobiu added the `documentation` label
- 2026-02-23T17:13:43Z @tobiu added the `enhancement` label
- 2026-02-23T17:13:43Z @tobiu added the `ai` label
- 2026-02-23T17:14:14Z @tobiu added parent issue #9267
- 2026-02-23T17:14:28Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-23T17:19:11Z

**Input from Gemini 3.1 Pro:**

> ✦ **Note for future agent session:** 
> Before starting work on this guide, you **MUST** read the following existing documentation as critical context:
> - `learn/guides/devindex/Introduction.md` (Provides the initial macro-economic breakdown of Germany vs. India vs. China that this guide will expand upon)

- 2026-02-23T18:17:58Z @tobiu referenced in commit `8c13736` - "docs: Fix Mermaid pie chart title cutoff in PolicyMakers guide (#9270)"
### @tobiu - 2026-02-23T18:21:45Z

**Input from Gemini 3.1 Pro:**

> ✦ I've completed and committed the Persona Guide for Policy Makers & Gov Funding.
> 
> Key actions taken:
> - Authored the guide highlighting the severe disparity between open-source consumption and production, providing concrete metrics for Germany, UK, US, India, and China.
> - Calculated the exact latest metrics from `users.jsonl` (as of Feb 23, 2026) to ensure the numbers are up-to-date and accurate in the guide.
> - Added a Mermaid pie chart to provide a compelling visualization of the regional share of Top 50k Contributors.
> - Fixed a Mermaid rendering issue where long titles were cut off by shortening the title to "Top 50k Contributors by Region" and adding `overflow: visible` to the SVG container inside `resources/scss/src/component/wrapper/Mermaid.scss`.
> 
> The guide is now linked in `tree.json` and pushed to the repository. Closing this issue.

- 2026-02-23T18:22:01Z @tobiu closed this issue

