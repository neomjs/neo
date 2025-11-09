---
id: 7210
title: Implement Window Management Permission Request
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-21T19:50:41Z'
updatedAt: '2025-08-21T19:51:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7210'
author: tobiu
commentsCount: 0
parentIssue: 7201
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-08-21T19:51:29Z'
---
# Implement Window Management Permission Request

**Reported by:** @tobiu on 2025-08-21

---

**Parent Issue:** #7201 - Dashboard Drag & Drop

---

**Status: Done**

## Overview

This ticket covers the implementation of a user-facing mechanism to request the `window-management` permission from the browser. This is a prerequisite for Phase 3 of the [EPIC-Dashboard-Drag-And-Drop.md](./EPIC-Dashboard-Drag-And-Drop.md), which involves creating and moving popup windows during a drag operation.

## Implementation Details

1.  **UI Button:**
    -   A new button, "Enable Window Management," was added to `apps/colors/view/HeaderToolbar.mjs`.
    -   This button serves as the user-initiated entry point for the permission request.

2.  **Controller Logic:**
    -   An event handler, `onEnableWindowManagementClick`, was added to `apps/colors/view/ViewportController.mjs`.
    -   This handler calls the new remote method on the `DragDrop` main thread addon.
    -   It updates the button's appearance (text, icon, disabled state) based on the success or failure of the permission request, providing clear feedback to the user.

3.  **Main Thread Addon Method:**
    -   A new remote method, `requestWindowManagementPermission`, was created in `src/main/addon/DragDrop.mjs`.
    -   This method encapsulates the browser API interaction, calling `window.getScreenDetails()` to trigger the permission prompt.
    -   It includes checks for a secure context (`window.isSecureContext`) and API availability, returning a detailed success or error status.

