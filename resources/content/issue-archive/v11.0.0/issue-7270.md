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
blockedBy: []
blocking: []
closedAt: '2025-10-08T11:53:39Z'
---
# Convert ManagerInstance.mjs Test from Siesta to Playwright

This task is to migrate the unit test for `ManagerInstance.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/ManagerInstance.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/ManagerInstance.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Timeline

- 2025-09-27T12:39:38Z @tobiu added parent issue #7262
- 2025-09-27T12:39:38Z @tobiu added the `enhancement` label
- 2025-10-03T16:24:41Z @tobiu added the `help wanted` label
- 2025-10-03T16:24:41Z @tobiu added the `good first issue` label
- 2025-10-03T16:24:41Z @tobiu added the `hacktoberfest` label
### @nabeel001 - 2025-10-07T03:56:33Z

Hi @tobiu 
I would like to work on this issue. Kindly assign this to me.


### @tobiu - 2025-10-07T07:04:05Z

Sure, and thanks for the interest.

This one can get auto-resolved with the "AI-Native" workflow.
https://github.com/neomjs/neo/blob/dev/.github/WORKING_WITH_AGENTS.md
https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md

One strong hint: let the agent read the epic file first (since it mentions details where LLMs can struggle):
`.github/ISSUE/epic-enhance-workflow-with-mandatory-unit-testing.md`
And your ticket afterwards (you can search for the GH ticket id).

- 2025-10-07T07:04:27Z @tobiu assigned to @nabeel001
- 2025-10-08T03:13:06Z @nabeel001 cross-referenced by PR #7415
### @nabeel001 - 2025-10-08T03:14:29Z

@tobiu 
Kindly review and merge the PR.

- 2025-10-08T11:53:39Z @tobiu closed this issue

