---
id: 7073
title: Refactor LivePreview to Use className-based Component Detection
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-16T10:08:50Z'
updatedAt: '2025-07-16T10:10:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7073'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-16T10:10:52Z'
---
# Refactor LivePreview to Use className-based Component Detection

**Reported by:** @tobiu on 2025-07-16

## Problem

The `LivePreview` component's mechanism for identifying the main component to render was overly reliant on a specific code pattern: the explicit assignment of a variable to the output of `Neo.setupClass()`. This was identified using the `findSetupClassName()` method.

This approach had two main drawbacks:

1.  **Redundant Code in Examples:** Functional components created with `defineComponent()` already have `Neo.setupClass()` called on them internally. To make them work with `LivePreview`, they required an extra, redundant `MyComponent = Neo.setupClass(MyComponent)` line at the end. This introduced unnecessary code and taught a poor coding pattern in our tutorials.

2.  **Brittleness:** The detection logic was brittle. If a developer forgot the final `setupClass()` line or wrote it in a slightly different way, the live preview would fail.

## Solution

To address this, the component detection logic in `LivePreview.mjs` has been refactored to be more robust and to promote cleaner example code.

1.  **New Detection Method:** The `findSetupClassName()` method has been removed and replaced with `findMainClassName()`.

2.  **Convention-over-Configuration:** The new method scans the source code for all `className` declarations. It then uses a convention-based approach to find the main component, searching for class names that end with (in order of priority):
    *   `MainContainer`
    *   `MainComponent`
    *   `MainView`
    *   `Main`

3.  **Fallback Mechanism:** If no class name matching the convention is found, the logic gracefully falls back to using the *last* `className` declared in the file. This ensures backward compatibility with existing examples that may not follow the new convention.

4.  **Cleaner Code:** This change allows us to remove the redundant `Neo.setupClass()` assignments from our functional component examples, resulting in cleaner, more idiomatic tutorial code. The `doRunSource()` method was updated to resolve the component instance using its class name string instead of a variable name.

