---
id: 8039
title: Fix drag proxy styling for StrategyPanel KPI cards
state: CLOSED
labels:
  - bug
  - design
assignees:
  - tobiu
createdAt: '2025-12-06T20:43:44Z'
updatedAt: '2025-12-06T20:52:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8039'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-06T20:52:38Z'
---
# Fix drag proxy styling for StrategyPanel KPI cards

Update `dragProxyExtraCls` in `apps/agentos/view/StrategyPanel.mjs` to `['agent-panel-strategy', 'neo-panel']` to ensure correct styling during drag operations.

Additionally, investigate and fix the issue where the drag proxy renders with an unwanted additional border.

**Scope:**
1.  Verify the `dragProxyExtraCls` change.
2.  Debug the drag proxy DOM structure and styles to identify the source of the extra border.
3.  Adjust SCSS in `resources/scss/src/apps/agentos/StrategyPanel.scss` or related files to remove the unwanted border on the proxy.


## Timeline

- 2025-12-06T20:43:45Z @tobiu added the `bug` label
- 2025-12-06T20:43:45Z @tobiu added the `design` label
- 2025-12-06T20:43:57Z @tobiu assigned to @tobiu
- 2025-12-06T20:52:28Z @tobiu referenced in commit `8a5bab5` - "Fix drag proxy styling for StrategyPanel KPI cards #8039"
- 2025-12-06T20:52:38Z @tobiu closed this issue
### @tobiu - 2025-12-06T20:52:47Z

**Input from Gemini 2.5 pro:**

> ✦ Fixed the drag proxy styling issue for the StrategyPanel.
> 
> **Changes:**
> 1.  **StrategyPanel.mjs:** Confirmed `dragProxyExtraCls` is set to `['agent-panel-strategy', 'neo-panel']`. This ensures the drag proxy (which wraps the dragged item) inherits the necessary CSS context so that nested selectors like `.agent-panel-strategy .agent-kpi-card-panel` continue to apply.
> 2.  **StrategyPanel.scss:** Added a specific rule for `&.neo-dragproxy` to remove the default border. This prevents the "double border" effect where both the proxy wrapper (which is now a `.neo-panel`) and the dragged item (the KPI card) would render borders.
> 
> **Outcome:**
> Dragging KPI cards now correctly renders the card with its original styling and no unwanted artifacts.
> 


