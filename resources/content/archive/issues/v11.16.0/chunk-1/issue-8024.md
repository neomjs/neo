---
id: 8024
title: Refactor Intervention View to dedicated Grid Component
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-04T22:48:55Z'
updatedAt: '2025-12-04T23:16:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8024'
author: tobiu
commentsCount: 1
parentIssue: 7918
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-04T23:16:00Z'
---
# Refactor Intervention View to dedicated Grid Component

Extract the inline intervention component from `apps/agentos/view/Viewport.mjs` into its own dedicated class `apps/agentos/view/InterventionPanel.mjs`.

**Requirements:**
- Create `apps/agentos/view/InterventionPanel.mjs` extending `Neo.container.Panel`.
- The panel will contain a `Neo.grid.Container` as its main item.
- The Grid will define columns for: Timestamp, Message, and Priority.

**Architectural Decision:**
We will move the *entire Panel* out to `InterventionPanel.mjs`. This encapsulates the "Intervention" domain logic (headers, tools, and the grid itself) into a single unit, keeping the Viewport clean. The Grid inside will be configured directly within this new class.

**Data Structure:**
The grid should support at least:
- Time
- Message
- Priority (Visual indicator)

## Timeline

- 2025-12-04T22:48:56Z @tobiu added the `enhancement` label
- 2025-12-04T22:48:56Z @tobiu added the `ai` label
- 2025-12-04T22:48:56Z @tobiu added the `refactoring` label
- 2025-12-04T22:49:12Z @tobiu added parent issue #7918
- 2025-12-04T22:49:37Z @tobiu assigned to @tobiu
- 2025-12-04T23:14:50Z @tobiu referenced in commit `daaddf9` - "Refactor Intervention View to dedicated Grid Component #8024"
### @tobiu - 2025-12-04T23:15:48Z

**Input from Gemini 2.5 pro:**

> ✦ I have implemented the dedicated `InterventionPanel` as a Grid component, along with a structured data layer.
> 
> **Changes Implemented:**
> 
> 1.  **Dedicated View Class:**
>     -   Created `apps/agentos/view/InterventionPanel.mjs` extending `Neo.container.Panel`.
>     -   Contains a `Neo.grid.Container` configured with columns for `Timestamp`, `Message`, and `Priority`.
>     -   Includes custom cell renderers for date formatting (HH:MM:SS) and priority color coding.
>     -   Refactored `apps/agentos/view/Viewport.mjs` to use this new component, replacing the inline HTML implementation.
> 
> 2.  **Data Layer (New Artifacts):**
>     -   **Model:** Created `apps/agentos/model/Intervention.mjs`. Defined fields (`id`, `timestamp` (Date), `message`, `priority`) and removed redundant configs.
>     -   **Store:** Created `apps/agentos/store/Interventions.mjs`. Configured with `autoLoad: true` and a URL pointing to the app-specific resource data.
>     -   **Data:** Created `apps/agentos/resources/data/interventions.json` containing dummy data with ISO 8601 formatted timestamps to ensure proper parsing by the Data Worker.
> 
> 3.  **Path Correction:**
>     -   Updated the Store URL to use `Neo.config.basePath + 'apps/agentos/resources/data/interventions.json'` to ensure compatibility across both development and production environments.

- 2025-12-04T23:16:00Z @tobiu closed this issue

