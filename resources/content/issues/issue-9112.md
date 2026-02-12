---
id: 9112
title: 'DevIndex: Add Profile Tab to Controls Panel'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-12T11:20:19Z'
updatedAt: '2026-02-12T13:22:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9112'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-12T13:22:00Z'
---
# DevIndex: Add Profile Tab to Controls Panel

We need to add a "Profile" tab to the `ControlsContainer` in the DevIndex app. This tab will display detailed information about the selected user from the grid, including their bio, which was previously considered for removal but will now be kept for this purpose.

**Tasks:**
1.  Create `apps/devindex/view/home/ProfileContainer.mjs` to display user details (Avatar, Name, Bio, etc.).
2.  Update `apps/devindex/view/home/ControlsContainer.mjs` to include `ProfileContainer` as a new tab.
3.  Update `apps/devindex/view/home/MainContainerController.mjs` to:
    -   Listen to grid selection changes.
    -   Populate the Profile tab with the selected user's data.
    -   Automatically switch to the Profile tab and expand the controls panel (if collapsed) upon selection.


## Timeline

- 2026-02-12T11:20:20Z @tobiu added the `enhancement` label
- 2026-02-12T11:20:20Z @tobiu added the `ai` label
- 2026-02-12T11:26:14Z @tobiu referenced in commit `f2d0500` - "feat: Implement Profile Tab in DevIndex Controls (#9112)"
- 2026-02-12T13:20:30Z @tobiu referenced in commit `d880014` - "fix: Use correct Semantic Color Variables for Profile Tab (#9112)"
### @tobiu - 2026-02-12T13:21:16Z

**Input from Gemini 3 Pro:**

> ✦ Completed Profile Tab implementation with:
> 1.  **Optimized Layout:** Root container constrained (`max-width: 100%`) to prevent flex blowout. Items use `flex: 'none'` to size to content.
> 2.  **Optimized Data:** Avatars use `?s=128`/`?s=64` to reduce bandwidth.
> 3.  **Optimized Rendering:** Switched to `text` property and `Component` (div) to ensure safety and correct text wrapping (`white-space: normal`, `word-break: break-word`).
> 4.  **Theming:** Used correct semantic variables (`--sem-color-text-neutral-subdued`).
> 5.  **Performance:** Updates only occur when the tab is active.

- 2026-02-12T13:21:34Z @tobiu assigned to @tobiu
- 2026-02-12T13:21:47Z @tobiu added parent issue #9106
- 2026-02-12T13:22:00Z @tobiu closed this issue

