---
id: 7161
title: Integrate Template Processing into `dist/production` Build
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-02T11:33:48Z'
updatedAt: '2025-08-02T12:49:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7161'
author: tobiu
commentsCount: 1
parentIssue: 7130
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-08-02T12:49:27Z'
---
# Integrate Template Processing into `dist/production` Build

**Reported by:** @tobiu on 2025-08-02

---

**Parent Issue:** #7130 - String-Based VDOM Templates

---

#### 1. Summary

Use the new reusable `astTemplateProcessor` to enable build-time `html` template transformation for the `dist/production` Webpack environment.

#### 2. Rationale

This is the final step to ensure `html` templates are a fully supported, production-ready feature. The transformation must be applied to the `dist/production` build to gain the performance benefits of pre-compilation in the most optimized deployment environment.

#### 3. Scope & Implementation Plan

1.  **Reuse Webpack Loader:** The same custom Webpack loader created for sub-task #26 can be used.
2.  **Configure Webpack:** Update the Webpack configuration for `dist/production` to apply the `template-loader.mjs` to all `.mjs` files before they are passed to other loaders like Babel or Terser.

#### 4. Definition of Done

-   The `dist/production` build process correctly transforms `html` templates into VDOM objects.
-   The final, minified production bundles contain optimized VDOM, not raw `html` template strings.
-   Applications running in `dist/production` mode render components using `html` templates correctly.

## Comments

### @tobiu - 2025-08-02 12:49

<img width="850" height="308" alt="Image" src="https://github.com/user-attachments/assets/162d0d4b-32f9-4fb6-bfd7-4c2f6b1ff4b6" />

