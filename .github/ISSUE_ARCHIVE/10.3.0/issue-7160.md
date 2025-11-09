---
id: 7160
title: Integrate Template Processing into `dist/development` Build
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-02T11:30:07Z'
updatedAt: '2025-08-02T12:41:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7160'
author: tobiu
commentsCount: 1
parentIssue: 7130
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-08-02T12:41:52Z'
---
# Integrate Template Processing into `dist/development` Build

**Reported by:** @tobiu on 2025-08-02

---

**Parent Issue:** #7130 - String-Based VDOM Templates

---

#### 1. Summary

Use the new reusable `astTemplateProcessor` to enable build-time `html` template transformation for the `dist/development` Webpack environment.

#### 2. Rationale

To ensure feature parity and a consistent developer experience, `html` templates must be correctly processed in the `dist/development` environment. This allows developers who use this environment (e.g., for TypeScript or specific debugging scenarios) to use the template syntax.

#### 3. Scope & Implementation Plan

1.  **Create Webpack Loader:** Create a custom Webpack loader (e.g., `buildScripts/webpack/loader/template-loader.mjs`).
2.  **Implement Loader Logic:**
    *   The loader will receive the file content.
    *   It will perform the same pre-emptive regex check from sub-task #7159 .
    *   If the check passes, it will import and call the `processFileContent()` function from `astTemplateProcessor.mjs`.
    *   It will return the transformed code (or the original code if the check fails) to the Webpack compilation chain.
3.  **Configure Webpack:** Update the Webpack configuration for `dist/development` to use this new loader for all `.mjs` files.

#### 4. Definition of Done

-   The custom Webpack loader is created and functional.
-   The `dist/development` build process correctly transforms `html` templates into VDOM objects.
-   Applications running in `dist/development` mode render components using `html` templates correctly.

## Comments

### @tobiu - 2025-08-02 12:41

<img width="1977" height="1426" alt="Image" src="https://github.com/user-attachments/assets/af74dbdc-237d-491c-ac2c-834739acaa30" />

