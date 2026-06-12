---
id: 7286
title: Convert state/createHierarchicalDataProxy.mjs Test from Siesta to Playwright
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - kart-u
createdAt: '2025-09-27T13:58:44Z'
updatedAt: '2025-10-07T19:00:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7286'
author: tobiu
commentsCount: 5
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-07T19:00:04Z'
---
# Convert state/createHierarchicalDataProxy.mjs Test from Siesta to Playwright

This task is to migrate the unit test for `state/createHierarchicalDataProxy.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/state/createHierarchicalDataProxy.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/state/createHierarchicalDataProxy.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Timeline

- 2025-09-27T13:58:45Z @tobiu added the `enhancement` label
- 2025-09-27T13:58:46Z @tobiu added parent issue #7262
- 2025-10-02T19:24:15Z @tobiu added the `help wanted` label
- 2025-10-02T19:24:15Z @tobiu added the `good first issue` label
- 2025-10-02T19:24:15Z @tobiu added the `hacktoberfest` label
### @kart-u - 2025-10-04T08:59:25Z

Hello @tobiu I would like to work on this , can you assign it to me

### @tobiu - 2025-10-04T09:21:30Z

sure. one more recommendation:
https://github.com/neomjs/neo/issues/7343

=> you can try out the new memory core, in case you update your fork to get the latest changes in there. this should help when working on test migrations. meaning: if you had a good session to migrate a test, inside a fresh session you can point the ai agent to that session memory, and it can pick up on it.

- 2025-10-04T09:21:35Z @tobiu assigned to @kart-u
### @kart-u - 2025-10-04T10:19:02Z

thanks!! will surely try this 

- 2025-10-04T12:06:56Z @kart-u referenced in commit `11d56da` - "Convert state/createHierarchicalDataProxy.mjs Test from Siesta to Playwright #7286"
- 2025-10-04T12:09:38Z @kart-u cross-referenced by PR #7355
### @kart-u - 2025-10-04T12:23:02Z

yes I tried new memory core , it was quite convenient ,without much additional input Gemini was able to infer issue from past contexts and less errors

now i have submitted PRs for all 4 assigned issues (waiting to be reviewed):-
#7293 
#7289 
#7286 
#7284 



### @tobiu - 2025-10-04T12:29:56Z

thanks! i will look into it very soon (today). feel free to join the slack and / or discord.

i am just ironing out a few more glitches with using the memory core:

<img width="991" height="1266" alt="Image" src="https://github.com/user-attachments/assets/94a07d38-b4f3-4ab7-9864-d4dde7bf683c" />

- 2025-10-04T15:52:51Z @kart-u referenced in commit `9ed2ac2` - "Convert state/createHierarchicalDataProxy.mjs Test from Siesta to Playwright #7286"
- 2025-10-04T17:07:06Z @kart-u referenced in commit `5019fcf` - "Convert state/createHierarchicalDataProxy.mjs Test from Siesta to Playwright #7286"
- 2025-10-04T17:33:05Z @kart-u referenced in commit `2d76a05` - "Convert state/createHierarchicalDataProxy.mjs Test from Siesta to Playwright #7286"
- 2025-10-07T19:00:04Z @tobiu closed this issue
- 2025-10-07T19:00:04Z @tobiu referenced in commit `0a3b18a` - "Convert state/createHierarchicalDataProxy.mjs Test from Siesta to Playwright #7286"
- 2025-10-07T19:00:05Z @tobiu referenced in commit `fdd9d85` - "Convert state/createHierarchicalDataProxy.mjs Test from Siesta to Playwright #7286"
- 2025-10-07T19:00:05Z @tobiu referenced in commit `b350183` - "Convert state/createHierarchicalDataProxy.mjs Test from Siesta to Playwright #7286"
- 2025-10-07T19:00:05Z @tobiu referenced in commit `06afc28` - "Convert state/createHierarchicalDataProxy.mjs Test from Siesta to Playwright #7286"

