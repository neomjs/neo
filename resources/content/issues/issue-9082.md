---
id: 9082
title: Refactor Portal Content Viewer to Framework Component
state: OPEN
labels:
  - documentation
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-10T03:40:43Z'
updatedAt: '2026-02-10T03:41:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9082'
author: tobiu
commentsCount: 0
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

