---
id: 7293
title: Convert vdom/layout/Cube.mjs Test from Siesta to Playwright
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - kart-u
createdAt: '2025-09-27T14:07:47Z'
updatedAt: '2025-10-04T18:47:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7293'
author: tobiu
commentsCount: 6
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-04T17:58:06Z'
---
# Convert vdom/layout/Cube.mjs Test from Siesta to Playwright

**Reported by:** @tobiu on 2025-09-27

---

**Parent Issue:** #7262 - Enhance Development Workflow with Mandatory Unit Testing

---

This task is to migrate the unit test for `vdom/layout/Cube.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/vdom/layout/Cube.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/vdom/layout/Cube.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Comments

### @kart-u - 2025-10-03 09:20

hello @tobiu ,
I will like to work on this issue, could you please assign it to me?

### @KURO-1125 - 2025-10-03 09:21

Hi! I'd like to work on this Cube test migration using the AI native workflow. 
Could you please assign this to me?
Thanks!


### @tobiu - 2025-10-03 16:24

Ha, these 2 comments came in almost at the same time. Assuming you are not the same person, I would stick to "first comment wins". I hope this is fine, since both of you already have other tickets assigned.

No worries, I can easily create more new tickets if needed.

### @tobiu - 2025-10-04 18:31

reopening, since something is off with the imports / top-level setup. only happens when running all tests combined.

### @kart-u - 2025-10-04 18:39

please check again made some changes asked Gemini on issue it state modified state of Neo.config.useDomApiRenderer might be messing with other tests

### @tobiu - 2025-10-04 18:47

the PR was already merged. somehow the combination of the cube layout and vdomrealword tests clashed. now all 114 tests are passing.

