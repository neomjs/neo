---
id: 7270
title: Convert ManagerInstance.mjs Test from Siesta to Playwright
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - nabeel001
createdAt: '2025-09-27T12:39:37Z'
updatedAt: '2025-10-08T11:53:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7270'
author: tobiu
commentsCount: 3
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-08T11:53:39Z'
---
# Convert ManagerInstance.mjs Test from Siesta to Playwright

**Reported by:** @tobiu on 2025-09-27

---

**Parent Issue:** #7262 - Enhance Development Workflow with Mandatory Unit Testing

---

This task is to migrate the unit test for `ManagerInstance.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/ManagerInstance.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/ManagerInstance.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Comments

### @nabeel001 - 2025-10-07 03:56

Hi @tobiu 
I would like to work on this issue. Kindly assign this to me.


### @tobiu - 2025-10-07 07:04

Sure, and thanks for the interest.

This one can get auto-resolved with the "AI-Native" workflow.
https://github.com/neomjs/neo/blob/dev/.github/WORKING_WITH_AGENTS.md
https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md

One strong hint: let the agent read the epic file first (since it mentions details where LLMs can struggle):
`.github/ISSUE/epic-enhance-workflow-with-mandatory-unit-testing.md`
And your ticket afterwards (you can search for the GH ticket id).

### @nabeel001 - 2025-10-08 03:14

@tobiu 
Kindly review and merge the PR.

