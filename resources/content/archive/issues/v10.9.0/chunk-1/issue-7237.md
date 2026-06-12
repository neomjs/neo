---
id: 7237
title: Formalize Agent & Documentation Standards
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-23T13:31:49Z'
updatedAt: '2025-09-23T13:32:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7237'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-09-23T13:32:20Z'
---
# Formalize Agent & Documentation Standards

## Description

To address a recurring failure in correctly documenting reactive configs, a series of enhancements were made to the agent protocol and project guidelines to create an explicit, enforceable standard.

This ensures that all AI-driven contributions adhere to the framework's core conventions, moving from an assumed understanding to a documented, systemic process.

## Changes

1.  **`CODING_GUIDELINES.md` Updated:**
    -   A new "JSDoc for Configs" section was added.
    -   This section explicitly defines the mandatory use of the `@reactive` tag for reactive configs (those ending in `_`).
    -   It also clarifies the correct, limited use of the `@protected` tag for internal configs only.

2.  **`AGENTS.md` Updated:**
    -   The "Session Initialization" process was updated with a new mandatory step: the agent **MUST** read `.github/CODING_GUIDELINES.md` at the start of every session.
    -   A `CRITICAL` note was added to the `core.Base.mjs` reading step, forcing the agent to focus on the technical implementation of the reactive config system.

## Impact

This work creates a permanent, explicit source of truth for documentation standards and makes adherence to them a non-negotiable part of the agent's core workflow. It fundamentally improves the reliability and consistency of all future AI contributions.

## Timeline

- 2025-09-23T13:31:49Z @tobiu assigned to @tobiu
- 2025-09-23T13:31:50Z @tobiu added the `enhancement` label
- 2025-09-23T13:32:13Z @tobiu referenced in commit `a147355` - "Formalize Agent & Documentation Standards #7237"
- 2025-09-23T13:32:20Z @tobiu closed this issue

