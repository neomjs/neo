---
id: 7128
title: Add State Provider Feedback Loop Test
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-30T09:57:57Z'
updatedAt: '2025-07-30T09:59:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7128'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-30T09:59:14Z'
---
# Add State Provider Feedback Loop Test

**Reported by:** @tobiu on 2025-07-30

## Description

This ticket is to formally add the new test file `test/siesta/tests/state/FeedbackLoop.mjs` to the repository and the test suite.

This test was created to verify and prevent a potential infinite recursion (feedback loop) when using `Neo.state.Provider` with form fields.

## Key Scenarios Tested

The `FeedbackLoop.mjs` test file ensures the following:

1.  **No Change Event on Programmatic Update:** When a component's `value` is updated programmatically via a state provider binding, it correctly updates the component's config but does **not** fire a `change` event. This is critical to prevent controllers from reacting to their own state changes.
2.  **Change Event on User-like Interaction:** When a component's `value` is changed directly (simulating a user interaction), it **does** fire the `change` event as expected.
3.  **Feedback Loop Prevention:** It simulates a common controller pattern where a `change` event handler calls `provider.setData()`. The test verifies that this sequence does not trigger another `change` event, thus preventing an infinite loop.

## Action Items

1.  Add the new file `test/siesta/tests/state/FeedbackLoop.mjs` to the project.
2.  Register the new test file in `test/siesta/siesta.js` to ensure it is run as part of the standard test suite. It should be added to the `state` group.

