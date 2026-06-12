---
id: 9834
title: 'Testing: Expand Neural Link Fixture to Expose Layout and Interaction SDK'
state: CLOSED
labels:
  - enhancement
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-04-09T20:15:11Z'
updatedAt: '2026-04-09T20:15:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9834'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-09T20:15:38Z'
---
# Testing: Expand Neural Link Fixture to Expose Layout and Interaction SDK

### Background
The `neuralLink` Playwright fixture previously only exposed a narrow set of instance-fetching methods. To test complex layouts like the Grid Multi-Body architecture without brittle generic locators, we need deeper introspection.

### Objective
Expand the Neural Link MCP Fixture to expose the full `ai/Client.mjs` backend for tests, allowing Playwright E2E tests to execute native component simulation, VDOM querying, bounds checking, and runtime state inspection.

### Scope
1. Update `test/playwright/fixtures.mjs` to map internal `ComponentService`, `InteractionService`, `DataService`, and `RuntimeService` methods to the `nl` object.
2. Apply the "Anchor & Echo" Knowledge Base strategy (JSDoc) to all new fixture methods to ensure the AI swarm can properly infer their usage natively without hallucinating.

## Timeline

- 2026-04-09T20:15:13Z @tobiu added the `enhancement` label
- 2026-04-09T20:15:14Z @tobiu added the `ai` label
- 2026-04-09T20:15:14Z @tobiu added the `testing` label
- 2026-04-09T20:15:29Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-09T20:15:31Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ I have fully expanded the `neuralLink` Playwright fixture in `test/playwright/fixtures.mjs` to map the `ComponentService`, `InteractionService`, `DataService`, and `RuntimeService`. 
> 
> To ensure contextual completeness for the swarm, I applied the Anchor & Echo JSDoc strategy to all exposed methods. 
> 
> Finally, I updated the `WhiteboxE2E.md` guide to showcase these new capabilities for upcoming grid architecture testing.
> 
> This code is committed and pushed. Closing this issue to fulfill the formal Ticket Gate protocol.

- 2026-04-09T20:15:38Z @tobiu referenced in commit `92c75b3` - "test: Expand Neural Link fixture APIs and add JSDoc (#9834)"
- 2026-04-09T20:15:38Z @tobiu closed this issue

