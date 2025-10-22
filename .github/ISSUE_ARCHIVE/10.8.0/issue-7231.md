---
id: 7231
title: Add Regression Testing Guidance to AGENTS.md
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-22T02:05:38Z'
updatedAt: '2025-09-22T02:15:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7231'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-09-22T02:15:20Z'
---
# Add Regression Testing Guidance to AGENTS.md

**Reported by:** @tobiu on 2025-09-22

## 1. Overview

This ticket proposes a minor but important enhancement to the `AGENTS.md` guidelines, specifically by adding a cross-reference to the unit testing guide for bug fixes. This will encourage the AI agent to create regression tests to prevent reoccurring bugs.

## 2. Scope of Work

### 2.1. Integrate Regression Testing Guidance into `AGENTS.md`

-   **Task:** Add a specific instruction for bug fixes within the "4. Verify" step of the "Development Workflow" section in `AGENTS.md`.
-   **Implementation:**
    -   Add the following text to step 4: "For bug fixes, ensure you've created regression tests (see `learn/guides/UnitTestingWithSiesta.md` for guidance)."
    -   This provides a clear action item and a direct reference to the relevant testing guide without cluttering the core workflow document.

## 3. Acceptance Criteria

-   `AGENTS.md` is updated to include the regression testing guidance in the "4. Verify" step.
-   The reference to `learn/guides/UnitTestingWithSiesta.md` is accurate.

