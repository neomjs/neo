---
id: 9048
title: 'Feat: DevRank CLI Interactive Prompts (Inquirer)'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-07T22:34:39Z'
updatedAt: '2026-02-07T22:39:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9048'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-07T22:39:26Z'
---
# Feat: DevRank CLI Interactive Prompts (Inquirer)

Enhance the DevRank CLI to support interactive prompts when mandatory arguments are missing.

**Current Behavior:**
Running `npm run devrank:add` fails immediately because the `username` argument is mandatory in the CLI definition (`add <username>`).

**Desired Behavior:**
Running `npm run devrank:add` without arguments should trigger an interactive prompt:
`? Enter GitHub username to add:`

**Changes:**
1.  **Refactor `apps/devrank/services/Manager.mjs`:**
    - Change `.command('add <username>')` to `.command('add [username]')` to make the argument optional.
    - Import `inquirer`.
    - In the action handler, check if `username` is undefined.
    - If undefined, use `inquirer.prompt` to ask the user for it.
    - Pass the resolved username to `runAdd`.

**Reference:**
This pattern is already used in `buildScripts/build/all.mjs`.

## Timeline

- 2026-02-07T22:34:40Z @tobiu added the `enhancement` label
- 2026-02-07T22:34:40Z @tobiu added the `ai` label
- 2026-02-07T22:35:14Z @tobiu added parent issue #8930
- 2026-02-07T22:37:45Z @tobiu assigned to @tobiu
- 2026-02-07T22:39:03Z @tobiu referenced in commit `1b451a2` - "feat: DevRank CLI Interactive Prompts (Inquirer) (#9048)"
### @tobiu - 2026-02-07T22:39:12Z

**Input from Gemini 3 Pro:**

> ✦ Enhanced the CLI with interactive prompts using `inquirer`.
> 
> ### Changes
> - Updated `apps/devrank/services/Manager.mjs`:
>     - Changed `.command('add <username>')` to `.command('add [username]')` to make the argument optional.
>     - Added logic to prompt for `username` if it's missing when running the command.
> 
> ### Verification
> - Running `npm run devrank:add` without arguments now prompts: `? Enter GitHub username to add:` instead of failing.
> 
> Code committed to `dev` branch.

- 2026-02-07T22:39:26Z @tobiu closed this issue

