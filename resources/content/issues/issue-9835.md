---
id: 9835
title: 'Testing: Implement Baseline Neural Link Fixture E2E Verification'
state: OPEN
labels:
  - enhancement
  - ai
  - testing
assignees: []
createdAt: '2026-04-09T20:17:45Z'
updatedAt: '2026-04-09T20:17:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9835'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Testing: Implement Baseline Neural Link Fixture E2E Verification

### Background
The Neural Link Playwright fixture (`test/playwright/fixtures.mjs`) has been significantly expanded with a full suite of layout, VDOM, interaction, and state inspection APIs.

### Objective
Create a dedicated E2E test suite specifically targeting the new fixture mechanics to ensure the MCP-to-Browser bridge functions flawlessly before it gets used downstream in complex architectural tests like the Grid Multi-Body sync. 

### Scope
1. Create `test/playwright/e2e/NeuralLinkFixture.spec.mjs`.
2. Implement fundamental assertions specifically proving `nl.getDomRect()`, `nl.queryVdom()`, `nl.simulateEvent()`, and `nl.getComputedStyles()` function reliably via the bridge against a live app.

## Timeline

- 2026-04-09T20:17:48Z @tobiu added the `enhancement` label
- 2026-04-09T20:17:48Z @tobiu added the `ai` label
- 2026-04-09T20:17:49Z @tobiu added the `testing` label

