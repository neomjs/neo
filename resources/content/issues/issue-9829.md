---
id: 9829
title: 'Documentation: Add Neural Link Fixture to Whitebox E2E Guide'
state: CLOSED
labels: []
assignees:
  - tobiu
createdAt: '2026-04-09T15:55:29Z'
updatedAt: '2026-04-09T15:56:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9829'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-09T15:56:11Z'
---
# Documentation: Add Neural Link Fixture to Whitebox E2E Guide

### Background
The initial `WhiteboxE2E.md` guide documented the raw client connection boilerplate. However, the Neo.mjs Playwright testing suite includes a powerful custom fixture (`neuralLink`) exported in `test/playwright/fixtures.mjs`.

### Objective
Update the **Whitebox E2E Testing Guide** to introduce and recommend the `neuralLink` fixture pattern. 

### Scope
1. Update testing examples to import `test` from the custom `fixtures.mjs` instead of the base `@playwright/test`.
2. Demonstrate how `({ neuralLink }) =>` abstracts away the boilerplate of fetching the `nlClient` and `sessionId`, providing a consolidated `nlApp` context wrapper.
3. Update the Grid example walkthrough to reflect `nlApp.queryComponent` usage.

## Timeline

- 2026-04-09T15:56:11Z @tobiu closed this issue
- 2026-04-09T15:56:11Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-09T15:56:13Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ I have successfully refactored `WhiteboxE2E.md` to showcase the `({ neuralLink }) =>` Playwright fixture wrapper over the raw MCP requests. This cleans up boilerplate code considerably inside our documentation and matches the framework standards. The issue has been committed, pushed, and closed!

- 2026-04-09T15:56:29Z @tobiu referenced in commit `d91f36a` - "docs: Add Neural Link fixture usage to Whitebox E2E guide (#9829)"

