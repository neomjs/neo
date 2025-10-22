---
id: 7127
title: Form Field afterSetValue Sequencing
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-30T09:53:42Z'
updatedAt: '2025-07-30T09:57:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7127'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-30T09:57:33Z'
---
# Form Field afterSetValue Sequencing

**Reported by:** @tobiu on 2025-07-30

## Description

This ticket documents the implementation of a sequence for the `afterSetValue` method in `Neo.form.field.Base`. The goal was to ensure that the `change` event consistently fires *after* the entire `afterSetValue` inheritance chain has completed.

## Changes

1.  **`src/form/field/Base.mjs`**:
    -   A `construct()` method was added.
    -   `Util.Function.createSequence()` is now used within `construct()` to sequence `fireChangeEvent` to run after the `afterSetValue` method.
    -   The direct call to `fireChangeEvent` was removed from `afterSetValue`.

2.  **`test/siesta/tests/form/field/AfterSetValueSequence.mjs`**:
    -   A new test file was created to verify the correct sequencing.
    -   It includes tests for both `Neo.form.field.Text` and `Neo.form.field.ComboBox`.
    -   The tests confirm that the `change` event fires after `afterSetValue` is complete.

## Open Discussion Point

During testing, it was discovered that `afterSetValue` is called twice for both `TextField` and `ComboBox` due to a recursive loop between their `value` and `inputValue` configs.

While the primary goal of ensuring the `change` event fires only once and at the correct time has been achieved, the redundant `afterSetValue` call remains.

