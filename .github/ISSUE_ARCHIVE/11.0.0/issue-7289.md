---
id: 7289
title: Convert state/ProviderNestedDataConfigs.mjs Test from Siesta to Playwright
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - kart-u
createdAt: '2025-09-27T14:02:37Z'
updatedAt: '2025-10-04T15:23:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7289'
author: tobiu
commentsCount: 5
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-04T15:10:45Z'
---
# Convert state/ProviderNestedDataConfigs.mjs Test from Siesta to Playwright

**Reported by:** @tobiu on 2025-09-27

---

**Parent Issue:** #7262 - Enhance Development Workflow with Mandatory Unit Testing

---

This task is to migrate the unit test for `state/ProviderNestedDataConfigs.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/state/ProviderNestedDataConfigs.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/state/ProviderNestedDataConfigs.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Comments

### @kart-u - 2025-10-03 09:28

hello @tobiu ,
I will like to work on this issue, could you please assign it to me?


### @tobiu - 2025-10-03 16:13

Hi and thanks for your interest. For the testing tickets, I strongly recommend trying out the "ai native" workflow.

I would read the hacktoberfest intro first:
https://github.com/neomjs/neo/issues/7296

Then the following 2 guides:
https://github.com/neomjs/neo/blob/dev/.github/WORKING_WITH_AGENTS.md
https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md

e.g. gemini cli should be capable to complete it on its own.

### @tobiu - 2025-10-04 14:49

reopening to fix the class definition to prevent breaking tests.

### @tobiu - 2025-10-04 15:10

i added a comment to the PR. i merged it anyways => i am not that strict to first-time contributors :)

<img width="472" height="59" alt="Image" src="https://github.com/user-attachments/assets/45c9e37d-a8fb-403d-9b59-ff8519575ca7" />

there was a hint about this in the epic. this is why i pointed out to tell gemini to read it first, smoothening your workflow.

### @kart-u - 2025-10-04 15:23

thank you for your understanding :)

