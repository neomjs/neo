---
id: 8389
title: Implement Releases Section using Shared Content View
state: OPEN
labels:
  - documentation
  - feature
assignees:
  - tobiu
createdAt: '2026-01-07T15:59:03Z'
updatedAt: '2026-01-07T15:59:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8389'
author: tobiu
commentsCount: 0
parentIssue: 8362
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Implement Releases Section using Shared Content View

Implement the "Releases" section in the Portal using the newly refactored shared content components.

**Goal:**
Display release notes in the Portal using the same "Tree Nav + Content + Sections List" layout as the "Learn" section.

**Scope:**
1.  **Stores:**
    -   Create `apps/portal/store/Releases.mjs` to fetch and manage the tree of release versions (likely from a `releases.json` index).
    -   Reuse or extend `apps/portal/store/ContentSections.mjs` for the right-hand sidebar.
2.  **View Construction:**
    -   Create `apps/portal/view/release/MainContainer.mjs` extending `apps/portal/view/shared/content/Container.mjs`.
    -   Create `apps/portal/view/release/MainContainerController.mjs`.
    -   Create `apps/portal/view/release/MainContainerStateProvider.mjs`.
3.  **Wiring:**
    -   In `MainContainerStateProvider`, map the generic `tree` store key to `apps/portal/store/Releases.mjs`.
    -   Map the generic `sections` store key to the section store.
4.  **Integration:**
    -   Update `apps/portal/view/news/TabContainer.mjs` (or equivalent) to replace the "Releases" placeholder with the new `MainContainer`.
5.  **Routing:**
    -   Configure the controller to handle `/news/releases/{version}` routes.

**Dependencies:**
-   Depends on the completion of #8388 (Refactor Learn).

## Activity Log

- 2026-01-07 @tobiu added the `documentation` label
- 2026-01-07 @tobiu added the `feature` label
- 2026-01-07 @tobiu assigned to @tobiu
- 2026-01-07 @tobiu added parent issue #8362

