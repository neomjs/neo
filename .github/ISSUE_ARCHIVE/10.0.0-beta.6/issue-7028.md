---
id: 7028
title: 'Feature: Centralized Functional Component Exports via _export.mjs'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-12T18:45:59Z'
updatedAt: '2025-07-12T18:46:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7028'
author: tobiu
commentsCount: 0
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-12T18:46:47Z'
---
# Feature: Centralized Functional Component Exports via _export.mjs

**Reported by:** @tobiu on 2025-07-12

---

**Parent Issue:** #6992 - Functional Components

---

**Is your feature request related to a problem? Please describe.**
Previously, importing functional components and their associated hooks required knowledge of their individual file paths, which could be cumbersome and less intuitive for developers.

**Describe the solution you'd like**
Introduce `src/functional/_export.mjs` as a centralized barrel file to export key functional utilities. This allows developers to import multiple related items from a single, convenient path.

**Implementation Details:**
`src/functional/_export.mjs` now exports:
*   `Component` (from `./component/Base.mjs`)
*   `defineComponent` (from `./defineComponent.mjs`)
*   `useConfig` (from `./useConfig.mjs`)

This enables simplified imports like:
`import {defineComponent, useConfig} from '../../../src/functional/_export.mjs';`

**Describe alternatives you've considered**
(None considered, as this is the implemented solution.)

**Additional context**
This enhancement significantly improves the developer experience by streamlining imports, enhancing discoverability, and providing a more consistent API for functional component development.

**Affected Files:**
*   `src/functional/_export.mjs`
*   `examples/functional/defineComponent/Component.mjs`

