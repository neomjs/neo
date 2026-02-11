---
id: 9082
title: Refactor Portal Content Viewer to Framework Component
state: CLOSED
labels:
  - documentation
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-10T03:40:43Z'
updatedAt: '2026-02-11T00:00:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9082'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-11T00:00:25Z'
---
# Refactor Portal Content Viewer to Framework Component

Refactor the Portal's Markdown Content Viewer into a reusable framework component to enable its use within DevRank and other applications.

**Scope:**
1.  **Move Code:** Relocate `apps/portal/view/shared/content` to `src/app/content` (or similar shared namespace).
2.  **Refactor Portal:** Update `apps/portal` to consume the new shared component.
3.  **DevRank Docs:** Create a new `learn/devrank` folder structure for documentation (Methodology, Spider, Architecture).
4.  **DevRank Integration:** (Future) Replace the DevRank "About" tab with the new Content Viewer, loading the `learn/devrank` content.

**Goal:**
Provide a standardized, high-quality documentation viewer for all Neo.mjs applications.


## Timeline

- 2026-02-10T03:40:45Z @tobiu added the `documentation` label
- 2026-02-10T03:40:45Z @tobiu added the `ai` label
- 2026-02-10T03:40:45Z @tobiu added the `refactoring` label
- 2026-02-10T03:40:54Z @tobiu added parent issue #8930
- 2026-02-10T03:41:08Z @tobiu assigned to @tobiu
- 2026-02-10T23:55:55Z @tobiu referenced in commit `bae2794` - "refactor: Move Portal Content Viewer to Framework (#9082)"
### @tobiu - 2026-02-11T00:00:13Z

**Input from Gemini 3 Pro:**

> I have successfully refactored the Portal Content Viewer into a reusable framework component.
> 
> **Changes:**
> 1.  **Moved Source:** Relocated `apps/portal/view/shared/content` to `src/app/content` (Namespace: `Neo.app.content`).
> 2.  **Refactored Portal:** Updated all Portal views (`Learn`, `News`, `Tickets`, `Blog`, `Releases`) to consume the new `Neo.app.content` components.
> 3.  **Standardized Styling:**
>     *   Moved SCSS from `apps/portal` to `resources/scss/src/app/content`.
>     *   Renamed CSS variables from `--portal-*` to `--neo-app-content-*`.
>     *   Updated `neo-dark` and `neo-light` themes to support the new variable names.
> 4.  **DevRank Docs:** Created the foundation for DevRank documentation in `learn/guides/devrank` with `tree.json`, `Methodology.md`, `Spider.md`, and `Architecture.md`.
> 
> This paves the way for the DevRank "About" tab to reuse this high-quality viewer.

- 2026-02-11T00:00:25Z @tobiu closed this issue

