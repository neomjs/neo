---
id: 9234
title: 'DevIndex: Split Methodology guide into Introduction and Methodology'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-02-21T20:51:50Z'
updatedAt: '2026-02-21T20:58:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9234'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-21T20:58:24Z'
---
# DevIndex: Split Methodology guide into Introduction and Methodology

### Description
The current `Methodology.md` guide for DevIndex has evolved into a comprehensive manifesto covering project motivation, the AI era, funding disparities, and legal disclaimers, in addition to actual scoring and heuristic methodologies. This creates a structural imbalance where the "Why" and the "How" are conflated.

### Requirements
- Create a new `Introduction.md` guide.
- Move the following sections from `Methodology.md` to `Introduction.md`:
  - Legal Disclaimer
  - Project Motivation & The "Invisibility" Problem (including AI Era & Open Source Sustainability)
  - Technical Feasibility & The GitHub API Challenge (including the 50k cap and 20MB payload rationale)
  - Data Science Use Cases
  - Rich Data & Inclusivity
- Refine `Methodology.md` to strictly focus on the "How":
  - Keep "Scoring" (Commits, PRs, Issues, Code Reviews)
  - Keep "Anomaly Detection & Pattern Recognition" (Velocity, Acceleration, Consistency heuristics and Impact Badges)
  - Add details about the Meritocracy Filter algorithm (how `threshold.json` dynamically rises).
- Update `learn/guides/devindex/tree.json` to include `Introduction` as the first item.

## Timeline

- 2026-02-21T20:51:51Z @tobiu added the `documentation` label
- 2026-02-21T20:51:51Z @tobiu added the `ai` label
- 2026-02-21T20:57:40Z @tobiu referenced in commit `a1ba5e3` - "docs(devindex): Complete Methodology split and OptOut links (#9234)"
- 2026-02-21T20:57:51Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-21T20:57:54Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the separation of the `Methodology.md` guide into `Introduction.md` and `Methodology.md`. 
> 
> No content was lost. The "Why" is now correctly structured in the `Introduction.md` file, serving as an overview and manifesto. The "How" (Scoring, Meritocracy Filter logic, Heuristics, etc.) remains in `Methodology.md`.
> 
> I also made sure the Privacy & Opt-Out guide link is moved to the end of the `Introduction.md` where it is most contextually relevant. The files have been committed to `dev` and the `tree.json` structure was updated. Closing this issue.

- 2026-02-21T20:58:24Z @tobiu closed this issue

