---
id: 8111
title: 'Feature: Create AgentOSStrategy Child App for Isolation'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-14T23:58:30Z'
updatedAt: '2025-12-15T00:00:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8111'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-15T00:00:10Z'
---
# Feature: Create AgentOSStrategy Child App for Isolation

To resolve conflicts where multiple controllers (`StrategyPanelController`, `ViewportController`) intercept the same global `onWindowConnect` events, we are introducing a dedicated child app for strategy widgets.

**Goal:**
Create `AgentOSStrategy` (cloned from `AgentOSWidget`) to serve as the container for `kpi-velocity` and other strategy dashboard items when popped out.

**Changes:**
1.  Create `apps/agentos/childapps/strategy/` with `app.mjs`, `index.html`, `neo-config.json`, and `view/Viewport.mjs`.
2.  Set `appName` to `AgentOSStrategy`.
3.  Update `StrategyPanelController` to spawn this specific app and listen for its connection events, ensuring strict isolation from the Swarm/Intervention logic.

## Timeline

- 2025-12-14T23:58:31Z @tobiu added the `enhancement` label
- 2025-12-14T23:58:31Z @tobiu added the `ai` label
- 2025-12-14T23:58:31Z @tobiu added the `architecture` label
- 2025-12-14T23:59:29Z @tobiu assigned to @tobiu
- 2025-12-14T23:59:56Z @tobiu referenced in commit `4b7079e` - "Feature: Create AgentOSStrategy Child App for Isolation #8111"
- 2025-12-15T00:00:11Z @tobiu closed this issue

