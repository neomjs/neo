---
id: 9784
title: '[Epic] Strategic Intelligence Engine: Graph Drift & Gravity Detection'
state: CLOSED
labels:
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-08T10:01:07Z'
updatedAt: '2026-04-08T11:39:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9784'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues:
  - '[x] 9785 Implement Topological Gravity Detection in GraphService'
  - '[x] 9786 Graph Schema: Gravity Wells & Strategic Weights'
  - '[x] 9787 Implement Strategic Drift Detection (Sandman)'
subIssuesCompleted: 3
subIssuesTotal: 3
blockedBy: []
blocking: []
closedAt: '2026-04-08T10:08:09Z'
---
# [Epic] Strategic Intelligence Engine: Graph Drift & Gravity Detection

> Elevate the Graph Database into a strategic intelligence engine capable of discovering disconnected development cycles and mapping technical debt gravity.
> 
> **Child Tasks:**
> - Implement topological `in_degree` gravity calculations within `GraphService`.
> - Enrich Node schema to support `gravity_well` and `strategic_weight` attributes.
> - Implement Strategic Drift detection in `DreamService` (Sandman).

## Timeline

- 2026-04-08T10:01:08Z @tobiu added the `epic` label
- 2026-04-08T10:01:08Z @tobiu added the `ai` label
- 2026-04-08T10:01:09Z @tobiu added the `architecture` label
- 2026-04-08T10:01:27Z @tobiu added sub-issue #9785
- 2026-04-08T10:01:29Z @tobiu added sub-issue #9786
- 2026-04-08T10:01:30Z @tobiu added sub-issue #9787
- 2026-04-08T10:01:41Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-08T10:08:08Z

Epic completed. All child tasks (#9785, #9786, #9787) have been merged and closed, successfully upgrading the Core Native Graph to behave as a mathematical proxy for Strategic Intelligence and Drift mapping. Validated across Playwright core AI tests.

- 2026-04-08T10:08:09Z @tobiu closed this issue
- 2026-04-08T11:38:59Z @tobiu referenced in commit `1369030` - "test: Fix Sandman regression suite natively (#9784)

- Mocked physical boundaries (linkNodes, getContextFrontier) to ensure mathematical pipeline parses without sandbox violations.
- Fixed an I/O bug inside DreamService where synthesizeGoldenPath used a hardcoded physical path instead of respecting aiConfig.handoffFilePath, preventing test introspection."
### @tobiu - 2026-04-08T11:39:20Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ The Sandman/Golden Path mathematical pipeline and markdown injection sequence have been thoroughly hardened and integrated.
> 
> We fixed a bug related to hardcoded file paths preventing test mocks to simulate I/O operations natively, and established Playwright definitions covering semantic extraction, markdown duplicates, gap analysis logic, and boundary-condition assertions (topological blocks evaluation rejection).
> 
> Tests are pushed directly to `dev`. Closing out this epic!


