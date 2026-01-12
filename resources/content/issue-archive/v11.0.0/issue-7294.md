---
id: 7294
title: Convert vdom/table/Container.mjs Test from Siesta to Playwright
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - KURO-1125
createdAt: '2025-09-27T14:09:12Z'
updatedAt: '2025-10-02T19:54:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7294'
author: tobiu
commentsCount: 7
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-02T19:54:47Z'
---
# Convert vdom/table/Container.mjs Test from Siesta to Playwright

This task is to migrate the unit test for `vdom/table/Container.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/vdom/table/Container.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/vdom/table/Container.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Timeline

- 2025-09-27T14:09:13Z @tobiu added the `enhancement` label
- 2025-09-27T14:09:13Z @tobiu added parent issue #7262
- 2025-09-29T14:53:09Z @tobiu added the `help wanted` label
- 2025-09-29T14:53:09Z @tobiu added the `good first issue` label
- 2025-09-29T14:53:09Z @tobiu added the `hacktoberfest` label
### @KURO-1125 - 2025-10-02T17:13:41Z

Hi! I'd like to work on this issue for Hacktoberfest. 

I have experience with JavaScript testing frameworks and I'm familiar with both Siesta and Playwright. I plan to:

1. Create the new test file at `test/playwright/unit/vdom/table/Container.spec.mjs`
2. Migrate all assertions from Siesta's `t.is()` and `t.isDeeplyStrict()` to Playwright's `expect()` syntax
3. Ensure the test covers all functionality from the original file
4. Verify the test runs successfully with `npm test`

Could you please assign this issue to me? 

Thanks!


### @tobiu - 2025-10-02T17:30:26Z

Hi and thanks for the interest. For this ticket, I strongly recommend to try out the "ai native" workflow:
https://github.com/neomjs/neo/blob/dev/.github/WORKING_WITH_AGENTS.md
https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md

=> Gemini was able to rush through several migrations without any help.

<img width="1042" height="1285" alt="Image" src="https://github.com/user-attachments/assets/d0144e02-2412-46da-8047-17fa505b291f" />

<img width="1039" height="1391" alt="Image" src="https://github.com/user-attachments/assets/23a23f6c-3612-4f9f-9e09-f98c0299241a" />

Of course you can also do it manually, but it feels a bit like wasting time here.

- 2025-10-02T17:30:40Z @tobiu assigned to @KURO-1125
- 2025-10-02T17:33:18Z @tobiu cross-referenced by #7285
### @KURO-1125 - 2025-10-02T19:13:58Z

Thanks for the AI native workflow guidance! I've successfully used it:

✅ Set up the knowledge base and Gemini CLI
✅ Used the `follow the instructions inside @AGENTS.md` handshake  
✅ Let the AI handle both migrations autonomously
✅ AI created proper tickets and working test implementations
✅ All tests pass (66/66)

The AI workflow is impressive - much more efficient than manual work! 

Branch ready: `migrate-vdom-table-container-test`


### @tobiu - 2025-10-02T19:18:44Z

Thanks for the feedback! I am still polishing the new memory core (other pinned epic). the code is already done, i just need to add the documentation. Inside the Github page of your fork, there is a pull request button. Then you can send the PR to the neo dev branch, and i will add the `hacktoberfest-accepted` label and merge it in.

### @tobiu - 2025-10-02T19:19:21Z

i should add: ideally one PR for each sub, so that both count for the event.

### @tobiu - 2025-10-02T19:20:48Z

i will flag more of the testing subs with the `hacktoberfest` label now.

- 2025-10-02T19:31:27Z @KURO-1125 cross-referenced by PR #7330
### @KURO-1125 - 2025-10-02T19:33:24Z

Perfect! I've created two separate PRs as requested:

1. vdom/table/Container migration: `migrate-vdom-table-container` branch
2. neo/MixinStaticConfig migration: `migrate-neo-mixin-static-config` branch

Thanks for flagging more test migration issues with the hacktoberfest label!


- 2025-10-02T19:54:47Z @tobiu closed this issue

