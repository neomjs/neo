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
blockedBy: []
blocking: []
closedAt: '2025-10-04T15:10:45Z'
---
# Convert state/ProviderNestedDataConfigs.mjs Test from Siesta to Playwright

This task is to migrate the unit test for `state/ProviderNestedDataConfigs.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/state/ProviderNestedDataConfigs.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/state/ProviderNestedDataConfigs.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Timeline

- 2025-09-27T14:02:38Z @tobiu added parent issue #7262
- 2025-09-27T14:02:39Z @tobiu added the `enhancement` label
- 2025-10-02T19:23:00Z @tobiu added the `help wanted` label
- 2025-10-02T19:23:00Z @tobiu added the `good first issue` label
- 2025-10-02T19:23:00Z @tobiu added the `hacktoberfest` label
### @kart-u - 2025-10-03T09:28:08Z

hello @tobiu ,
I will like to work on this issue, could you please assign it to me?


### @tobiu - 2025-10-03T16:13:57Z

Hi and thanks for your interest. For the testing tickets, I strongly recommend trying out the "ai native" workflow.

I would read the hacktoberfest intro first:
https://github.com/neomjs/neo/issues/7296

Then the following 2 guides:
https://github.com/neomjs/neo/blob/dev/.github/WORKING_WITH_AGENTS.md
https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md

e.g. gemini cli should be capable to complete it on its own.

- 2025-10-03T16:14:04Z @tobiu assigned to @kart-u
- 2025-10-04T09:35:19Z @kart-u referenced in commit `f60907c` - "Convert state/ProviderNestedDataConfigs.mjs Test from Siesta to Playwright #7289"
- 2025-10-04T09:45:35Z @kart-u cross-referenced by PR #7347
- 2025-10-04T09:58:12Z @kart-u cross-referenced by PR #7350
- 2025-10-04T10:31:18Z @kart-u cross-referenced by PR #7351
- 2025-10-04T12:23:03Z @kart-u cross-referenced by #7286
- 2025-10-04T14:28:05Z @tobiu closed this issue
- 2025-10-04T14:28:05Z @tobiu referenced in commit `d252f7e` - "Convert state/ProviderNestedDataConfigs.mjs Test from Siesta to Playwright #7289"
### @tobiu - 2025-10-04T14:49:50Z

reopening to fix the class definition to prevent breaking tests.

- 2025-10-04T14:49:50Z @tobiu reopened this issue
- 2025-10-04T14:52:39Z @tobiu referenced in commit `11c42a5` - "#7289 class definition fix, internal ticket update"
### @tobiu - 2025-10-04T15:10:45Z

i added a comment to the PR. i merged it anyways => i am not that strict to first-time contributors :)

<img width="472" height="59" alt="Image" src="https://github.com/user-attachments/assets/45c9e37d-a8fb-403d-9b59-ff8519575ca7" />

there was a hint about this in the epic. this is why i pointed out to tell gemini to read it first, smoothening your workflow.

- 2025-10-04T15:10:45Z @tobiu closed this issue
### @kart-u - 2025-10-04T15:23:05Z

thank you for your understanding :)


