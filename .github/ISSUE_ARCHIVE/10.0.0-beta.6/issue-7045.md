---
id: 7045
title: Introduce `Neo.createConfig` for Unified Reactive Property Definition
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-13T23:07:23Z'
updatedAt: '2025-07-13T23:08:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7045'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-13T23:08:12Z'
---
# Introduce `Neo.createConfig` for Unified Reactive Property Definition

**Reported by:** @tobiu on 2025-07-13

### 1. Summary

Introduce a new core utility function, `Neo.createConfig`, to centralize and standardize the process of defining reactive configuration properties in Neo.mjs. This function will be capable of defining reactive properties on both class prototypes (for static `config` definitions) and individual instances (for dynamic, runtime-defined reactive state).

### 2. Rationale

Currently, the logic for generating reactive getters and setters (`autoGenerateGetSet`) is primarily used within `Neo.setupClass` for class-level configurations. To enable dynamic, instance-level reactive properties with full Neo.mjs reactivity (including `beforeGet`, `beforeSet`, and `afterSet` hooks), and to streamline the core framework, a unified approach is needed. This will make the reactive system more flexible, consistent, and easier to extend.

### 3. Scope & Implementation Plan

1.  **Implement `Neo.createConfig`:**
    *   **Signature:** `Neo.createConfig(target, key, initialValue)`
        *   `target`: The object (class prototype or instance) on which the reactive config will be defined.
        *   `key`: The name of the config property (without the `_` suffix).
        *   `initialValue`: The initial value for the config.
    *   **Internal Logic:**
        *   Create an internal `Neo.core.Config` instance to manage the property's value.
        *   Store this `Neo.core.Config` instance in a dedicated, internal map on the `target` object.
        *   Call `autoGenerateGetSet(target, key)` to define the public getter/setter and private backing property.
        *   Set the initial value using the newly defined setter (`target[key] = initialValue;`) to ensure all associated hooks are triggered.

2.  **Refactor `Neo.setupClass`:**
    *   Modify `setupClass` to use `Neo.createConfig` when processing reactive properties from `static config` definitions. This has been implemented.

3.  **`autoGenerateGetSet`:**
    *   The logic previously in `autoGenerateGetSet` has been fully absorbed into `Neo.createConfig`.

### 4. Benefits

*   **Unified Reactive Config Definition:** A single, powerful function handles both static (class-level) and dynamic (instance-level) reactive configurations.
*   **Full Hook Support:** Ensures that dynamically added reactive properties behave identically to statically defined ones, including full `beforeGet`, `beforeSet`, and `afterSet` hook support.
*   **Correct Initial Value Handling:** The initial value is set via the setter, ensuring all associated hooks are triggered.
*   **Cleaner `setupClass`:** Streamlines the class setup process by delegating reactive config definition.
*   **Enables Dynamic State:** Paves the way for easily creating and managing reactive state directly on component instances at runtime.

