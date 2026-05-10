---
id: 8955
title: 'Feat: Migrate Sparkline Renderer to `src/canvas` & Enforce Defaults'
state: CLOSED
labels:
  - enhancement
  - ai
  - feature
assignees:
  - tobiu
createdAt: '2026-02-02T22:45:58Z'
updatedAt: '2026-02-02T22:54:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8955'
author: tobiu
commentsCount: 1
parentIssue: 8948
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-02T22:54:31Z'
---
# Feat: Migrate Sparkline Renderer to `src/canvas` & Enforce Defaults

## Goal
Establish `src/canvas` as the home for shared canvas worker renderers and promote the `DevRank.canvas.Sparkline` renderer to a generic `Neo.canvas.Sparkline` implementation.

## Scope
1.  **Architecture:**
    -   Create `src/canvas/` directory.
    -   Create `src/canvas/_export.mjs`.

2.  **Migration:**
    -   Move `apps/devrank/canvas/Sparkline.mjs` to `src/canvas/Sparkline.mjs`.
    -   Rename class to `Neo.canvas.Sparkline`.
    -   Update JSDoc and `className` config.
    -   Export in `src/canvas/_export.mjs`.

3.  **Default Configuration:**
    -   Update `src/component/Sparkline.mjs`:
        -   Set default `rendererClassName` to `'Neo.canvas.Sparkline'`.
        -   Set default `rendererImportPath` to `'src/canvas/Sparkline.mjs'`.

4.  **Application Cleanup:**
    -   Update `apps/devrank/view/GridContainer.mjs`:
        -   Remove explicit `rendererClassName` and `rendererImportPath` configs from the Sparkline column definition (relying on the new defaults).

## Note
This completes the Generic Sparkline Epic by decoupling the renderer from the application code.

## Timeline

- 2026-02-02T22:46:00Z @tobiu added the `enhancement` label
- 2026-02-02T22:46:00Z @tobiu added the `ai` label
- 2026-02-02T22:46:00Z @tobiu added the `feature` label
- 2026-02-02T22:53:03Z @tobiu referenced in commit `de02f0a` - "feat: Migrate Sparkline Renderer to src/canvas & Enforce Defaults (#8955)"
- 2026-02-02T22:53:14Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-02T22:53:29Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully migrated the Sparkline renderer to `src/canvas` and enforced the new defaults.
> 
> **Changes:**
> 1.  **Architecture:** Created `src/canvas/` and `src/canvas/_export.mjs` to establish a home for shared canvas renderers.
> 2.  **Migration:** Moved `apps/devrank/canvas/Sparkline.mjs` to `src/canvas/Sparkline.mjs` and renamed the class to `Neo.canvas.Sparkline`.
> 3.  **Defaults Enforced:** Updated `src/component/Sparkline.mjs` to use `Neo.canvas.Sparkline` and `src/canvas/Sparkline.mjs` as defaults. Updated JSDoc types to `{String}`.
> 4.  **Application Cleanup:** Removed the explicit renderer overrides from `apps/devrank/view/GridContainer.mjs`.
> 
> The generic Sparkline component is now fully autonomous and ready for widespread use without requiring custom renderer configuration.

- 2026-02-02T22:54:15Z @tobiu added parent issue #8948
- 2026-02-02T22:54:31Z @tobiu closed this issue
- 2026-02-02T22:54:38Z @tobiu cross-referenced by #8948

