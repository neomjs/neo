---
id: 7222
title: 'Create Learning Guide: Unit Testing with Siesta'
state: CLOSED
labels:
  - documentation
  - enhancement
  - no auto close
assignees:
  - tobiu
createdAt: '2025-09-20T11:58:38Z'
updatedAt: '2025-09-20T12:19:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7222'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-09-20T12:19:11Z'
---
# Create Learning Guide: Unit Testing with Siesta

**Reported by:** @tobiu on 2025-09-20

### Problem
The Neo.mjs repository currently lacks a dedicated learning guide or tutorial on how to write unit tests for components. While a testing framework (Siesta) is in place, there is no documentation explaining how developers can use it to test their own class-based or functional components. This is a significant barrier for new contributors and developers who want to build robust, well-tested applications.

### Solution
Create a new learning guide in the `learn/guides` section titled "Unit Testing with Siesta". This guide should provide a comprehensive, step-by-step introduction to the testing workflow in Neo.mjs.

### Content Outline
The guide should cover the following topics:

1.  **Introduction to Siesta:**
    *   Brief overview of the Siesta testing framework and its role in the Neo.mjs ecosystem.
    *   Explanation of the test runner and where to view test results.

2.  **Setting Up a New Test:**
    *   How to create a new test file.
    *   How to add the new test file to the test plan in `test/siesta/siesta.js`.

3.  **Writing a Basic Test:**
    *   Anatomy of a Siesta test file (`t => {}`).
    *   Writing a simple test for a `Neo.core.Base` extension.
    *   Common assertion methods (`t.is()`, `t.ok()`, `t.it()`, etc.).

4.  **Testing Class-Based Components:**
    *   How to instantiate a component for testing.
    *   Testing component configuration and default values.
    *   Testing component methods.
    *   Testing `afterSet` hooks and reactivity.

5.  **Testing Functional Components:**
    *   How to render a functional component for testing.
    *   Testing the output of the `createVdom` method.
    *   Testing component props and reactivity.

6.  **Advanced Topics & Best Practices:**
    *   Asynchronous testing (`async`/`await` with `t.waitFor()`).
    *   Mocking dependencies.
    *   Organizing tests with `t.describe()`.

### Acceptance Criteria
-   A new markdown file is created at `learn/guides/testing/UnitTestingWithSiesta.md`.
-   The guide follows the proposed content outline.
-   The guide includes clear, runnable code examples.
-   The new guide is added to the `learn/tree.json` file to appear in the documentation navigation.

