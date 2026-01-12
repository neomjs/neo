---
id: 8389
title: Implement Releases Section using Shared Content View
state: CLOSED
labels:
  - documentation
  - feature
assignees:
  - tobiu
createdAt: '2026-01-07T15:59:03Z'
updatedAt: '2026-01-07T22:19:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8389'
author: tobiu
commentsCount: 0
parentIssue: 8362
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-07T22:19:02Z'
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

## Timeline

- 2026-01-07T15:59:04Z @tobiu added the `documentation` label
- 2026-01-07T15:59:05Z @tobiu added the `feature` label
- 2026-01-07T15:59:22Z @tobiu assigned to @tobiu
- 2026-01-07T15:59:27Z @tobiu added parent issue #8362
- 2026-01-07T17:39:19Z @tobiu referenced in commit `c4e8020` - "feat(#8389): Implement Releases section with shared content view architecture

- Refactor Shared Content View:
  - Extract generic content logic to apps/portal/view/shared/content/
  - Introduce getContentPath() template method in shared Component
  - Create domain-specific subclasses for Learn and Release content
  - Update PageContainer and MainContainer to use dynamic item injection via config

- Implement Releases Feature:
  - Create Portal.model.Release and Portal.store.Releases
  - Create Portal.view.release.MainContainer and related classes
  - Integrate Releases into NewsTabContainer with routing

- Refactor Portal Blog/News:
  - Update NewsTabContainer to use routes for tabs
  - Fix store auto-loading in Release state provider
  - Update ViewportController routing to handle nested news paths"
- 2026-01-07T17:39:20Z @tobiu referenced in commit `338e50b` - "fix(#8389): Add leading slash to NewsTabContainer routes"
- 2026-01-07T22:19:02Z @tobiu closed this issue

