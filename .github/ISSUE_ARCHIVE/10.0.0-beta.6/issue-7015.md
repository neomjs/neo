---
id: 7015
title: Enhance `Neo.core.Effect` Constructor
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-11T10:27:55Z'
updatedAt: '2025-07-11T10:34:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7015'
author: tobiu
commentsCount: 0
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-11T10:34:53Z'
---
# Enhance `Neo.core.Effect` Constructor

**Reported by:** @tobiu on 2025-07-11

---

**Parent Issue:** #6992 - Functional Components

---

## 1. Summary

This ticket covers a minor but important enhancement to the `Neo.core.Effect` class to support the functional component hook system.

## 2. Rationale

To allow hooks like `useConfig` to identify which component is currently rendering, we needed a way to link an active `Effect` back to its owner component. The cleanest, most decoupled way to achieve this was to add an optional `componentId` to the `Effect`'s constructor.

Since `core.Effect` is a new class introduced in the v10 beta series, adding an optional parameter is a safe, non-breaking change.

## 3. Scope & Implementation Plan

1.  **Update `Effect` Constructor:**
    *   Modify the `constructor` of `Neo.core.Effect` to accept an optional second parameter, `componentId`.
    *   If `componentId` is provided, store it on a public `this.componentId` property on the effect instance.

2.  **Update `FunctionalBase`:**
    *   In `Neo.functional.component.Base`, update the creation of the `vdomEffect` to pass `this.id` as the second argument to the `Effect` constructor.

## 4. Definition of Done

-   The `Neo.core.Effect` constructor is updated to accept an optional `componentId`.
-   `functional.component.Base` correctly passes its ID when creating its `vdomEffect`.
-   This change enables the `useConfig` hook to reliably get the current component instance.

