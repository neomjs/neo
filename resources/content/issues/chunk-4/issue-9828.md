---
id: 9828
title: 'Documentation: Create Whitebox E2E Testing Guide (Neural Link)'
state: CLOSED
labels: []
assignees:
  - tobiu
createdAt: '2026-04-09T15:49:57Z'
updatedAt: '2026-04-09T15:53:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9828'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-09T15:53:24Z'
---
# Documentation: Create Whitebox E2E Testing Guide (Neural Link)

### Background
Recent sessions have successfully established the foundational whitebox E2E testing infrastructure using Playwright and the new Neural Link bridge. We have transitioned from basic component testing to complex "Level 3" virtualized grid architecture testing (`GridContainer`, `ControlsContainer`, cross-component state synchronization).

While we have comprehensive guides for unit, component, and benchmarking, there is currently no documentation on **Whitebox E2E Testing**.

### Objective
Create the first iteration of the **Whitebox E2E Testing Guide** under `learn/guides/testing/WhiteboxE2E.md` and hook it into the learning application (`learn/tree.json`).

### Scope
1. **Explain the Why:** Briefly contrast traditional blackbox E2E (flaky, unreliable) with Neural Link Whitebox E2E (query component instances, read state directly, simulate exact native DOM events).
2. **Setup:** Document how to hook up an application (`neo-config.json` -> `"useAiClient": true`).
3. **Core API / Primitives:** Example of `NeuralLink_ComponentService.queryComponent` and how to read properties (like `value`), specifically handling differences in return depth.
4. **Example Walkthrough:** Reference the newly stabilized `GridBigDataNL.spec.mjs` test to show an end-to-end example of connecting, finding a `ComboBox`, verifying state, and disconnecting.

## Timeline

- 2026-04-09T15:53:11Z @tobiu referenced in commit `ad7a13a` - "docs: Add Whitebox E2E testing guide (#9828)"
- 2026-04-09T15:53:24Z @tobiu closed this issue
- 2026-04-09T15:53:25Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-09T15:53:28Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ I have successfully authored the Whitebox E2E testing guide, hooked it into `learn/tree.json`, and linked to it dynamically from `learn/guides/testing/Overview.md`. The code changes to document this baseline functionality are committed and pushed. I'm assigning this to myself and closing the ticket.


