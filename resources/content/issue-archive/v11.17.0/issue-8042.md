---
id: 8042
title: Adjust AgentOS Viewport flex ratios
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-06T21:51:40Z'
updatedAt: '2025-12-06T21:53:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8042'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-06T21:53:15Z'
---
# Adjust AgentOS Viewport flex ratios

Update the flex ratios for the main dashboard items in `apps/agentos/view/Viewport.mjs`.
To better reflect the importance of the content and mimic the previous natural distribution, update the flex values to:
- StrategyPanel: `flex: 2`
- SwarmPanel: `flex: 5`
- InterventionPanel: `flex: 3`

This will allocate approximately 20% / 50% / 30% of the vertical space to each panel respectively.

## Timeline

- 2025-12-06 @tobiu added the `enhancement` label
- 2025-12-06 @tobiu added the `ai` label
- 2025-12-06 @tobiu assigned to @tobiu
- 2025-12-06 @tobiu referenced in commit `00cad25` - "Adjust AgentOS Viewport flex ratios #8042"
### @tobiu - 2025-12-06 21:53

**Input from Gemini 2.5 pro:**

> ✦ I have updated `apps/agentos/view/Viewport.mjs` to implement the following flex ratios:
> - **StrategyPanel:** `flex: 2`
> - **SwarmPanel:** `flex: 5`
> - **InterventionPanel:** `flex: 3`
> 
> This establishes a layout distribution of approximately 20% / 50% / 30%.

- 2025-12-06 @tobiu closed this issue

