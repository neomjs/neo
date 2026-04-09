---
id: 9821
title: 'Enhancement: Neural Link VDOM Sync Primitives'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2026-04-09T11:33:54Z'
updatedAt: '2026-04-09T11:33:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9821'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking:
  - '[x] 8851 Exploration: Neural Link Driven Playwright Tests (Deep E2E)'
---
# Enhancement: Neural Link VDOM Sync Primitives

### Background
Currently, the AppWorker bridge tools (like `callMethod` and `setInstanceProperties`) resolve to `{success: true}` instantly upon finishing the Javascript action. Our Main Thread E2E tests are forced to blindly auto-retry CSS assertions because we have no topological sync mapping of when `me.update()` actually evaluates its VDOM delta in the Main Thread.

### Objective
- Enhance the MCP Server `neural-link` communication bridge. Provide developers with a mechanism to `await` the physical resolution of a VDOM update delta after injecting a property mutation, eliminating test race-conditions entirely.

## Timeline

- 2026-04-09T11:33:55Z @tobiu added the `enhancement` label
- 2026-04-09T11:33:56Z @tobiu added the `ai` label
- 2026-04-09T11:33:56Z @tobiu added the `architecture` label
- 2026-04-09T11:34:03Z @tobiu marked this issue as blocking #8851

