---
id: 7285
title: Convert neo/MixinStaticConfig.mjs Test from Siesta to Playwright
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - KURO-1125
createdAt: '2025-09-27T13:57:42Z'
updatedAt: '2025-10-02T19:50:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7285'
author: tobiu
commentsCount: 2
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-02T19:50:29Z'
---
# Convert neo/MixinStaticConfig.mjs Test from Siesta to Playwright

This task is to migrate the unit test for `neo/MixinStaticConfig.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/neo/MixinStaticConfig.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/neo/MixinStaticConfig.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Timeline

- 2025-09-27T13:57:44Z @tobiu added the `enhancement` label
- 2025-09-27T13:57:44Z @tobiu added parent issue #7262
- 2025-09-29T14:54:01Z @tobiu added the `help wanted` label
- 2025-09-29T14:54:01Z @tobiu added the `good first issue` label
- 2025-09-29T14:54:01Z @tobiu added the `hacktoberfest` label
### @KURO-1125 - 2025-10-02T17:29:57Z

Hi! I'd like to work on this issue for Hacktoberfest.

I have experience with JavaScript testing frameworks and have already successfully migrated another Siesta test to Playwright in this repository. For this MixinStaticConfig migration, I plan to:

1. Create the new test file at `test/playwright/unit/neo/MixinStaticConfig.spec.mjs`
2. Migrate all 4 test cases from the original Siesta file:
   - Basic mixin static config merging
   - Class config precedence over mixin configs
   - First mixin precedence for conflicting configs  
   - Inheritance scenarios with base class vs extended class mixins
3. Translate all Siesta assertions (`t.is()`) to Playwright's `expect().toBe()` syntax
4. Ensure proper setup configuration for Neo.mjs class system functionality
5. Verify all tests pass with `npm test`

I'm familiar with Neo.mjs's mixin system and static config merging behavior, so I can ensure the migrated tests maintain complete functional coverage while following the existing Playwright test patterns in the codebase.

Could you please assign this issue to me? 

Thanks!


- 2025-10-02T17:32:56Z @tobiu assigned to @KURO-1125
### @tobiu - 2025-10-02T17:33:17Z

Assigned. Please check my comment inside your other ticket first:
https://github.com/neomjs/neo/issues/7294#issuecomment-3362286193

- 2025-10-02T19:33:04Z @KURO-1125 cross-referenced by PR #7331
- 2025-10-02T19:50:29Z @tobiu closed this issue

