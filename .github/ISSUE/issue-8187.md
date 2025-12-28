---
id: 8187
title: 'Feat: Neural Link - State Provider Inspection & Modification'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-12-28T21:12:24Z'
updatedAt: '2025-12-28T21:12:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8187'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: Neural Link - State Provider Inspection & Modification

**Context:**
For modern Neo apps using `state.Provider`, inspecting the global state tree is the fastest way to understand the application context. Modifying this state is a powerful way to drive the application.

**Scope:**

1.  **Enhance `ComponentService`:**
    -   Update `getComponentTree` to include `stateProviderId` on components.

2.  **Enhance `DataService`:**
    -   Add `inspectStateProvider(sessionId, providerId)`.
        -   Implementation: `Neo.get(providerId).getHierarchyData()`.
    -   Add `modifyStateProvider(sessionId, providerId, data)`.
        -   Implementation: `Neo.get(providerId).setData(data)`.
        -   `data` is a JSON object with keys/values (can be nested).

3.  **Tools:**
    -   `inspect_state_provider`: Returns the effective state object.
    -   `modify_state_provider`: Updates the state.

**Goal:** Provide full read/write access to the application's reactive state hierarchy.

## Activity Log

- 2025-12-28 @tobiu added the `enhancement` label
- 2025-12-28 @tobiu added the `ai` label
- 2025-12-28 @tobiu added parent issue #8169

