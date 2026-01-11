---
id: 8360
title: Update Portal Landing Page Content (MainNeo) for Application Engine Branding
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-01-06T14:23:02Z'
updatedAt: '2026-01-06T14:29:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8360'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-06T14:29:27Z'
---
# Update Portal Landing Page Content (MainNeo) for Application Engine Branding

Update the landing page content to reflect the new "Application Engine" positioning.

**Target File:** `apps/portal/view/home/parts/MainNeo.mjs`

**Required Changes:**

1.  **Magic Move Text**:
    *   Update `cycleTexts` to align with the new branding (e.g., "The Application Engine for the AI Era", "Context Engineering", "True Multithreading", "Zero Build Step", "JSON Blueprints").

2.  **H3 Subtitle**:
    *   Rewrite the description text to emphasize "Application Engine", "AI Co-Developer", and "Desktop-Class UI".
    *   Example: "Neo.mjs is the Application Engine for the AI Era. Build desktop-class, multi-window apps with a true multi-threaded runtime and an AI co-developer."

3.  **Visual Alignment**:
    *   Ensure the changes fit within the existing layout structure (`MainNeo` component).

**Note:** `apps/portal/view/home/MainContainer.mjs` seems to be the orchestrator and likely doesn't need content updates, but should be verified.

## Timeline

- 2026-01-06T14:23:02Z @tobiu added the `documentation` label
- 2026-01-06T14:23:03Z @tobiu added the `ai` label
- 2026-01-06T14:23:34Z @tobiu assigned to @tobiu
- 2026-01-06T14:29:28Z @tobiu closed this issue
- 2026-01-06T20:30:56Z @tobiu cross-referenced by #8367
- 2026-01-07T13:25:08Z @jonnyamsp referenced in commit `701ab87` - "docs: Update Portal landing page content with comprehensive Application Engine branding (closes #8360)"

