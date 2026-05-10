---
id: 9086
title: 'Feat: DevRank Spider CLI Strategy Selection'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-10T14:30:29Z'
updatedAt: '2026-02-10T15:12:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9086'
author: tobiu
commentsCount: 2
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-10T15:12:22Z'
---
# Feat: DevRank Spider CLI Strategy Selection

Add a new CLI option `-s, --strategy <type>` to the `devrank:spider` command to force the execution of a specific discovery strategy.

**Requirements:**
- Update `apps/devrank/services/Manager.mjs` to parse the new option.
- Update `apps/devrank/services/Spider.mjs` to accept a strategy override in its `run()` method.
- Supported values: `community` (alias for `community_scan`), `keyword`, `temporal`, `stargazer`, `search` (Core).

**Acceptance Criteria:**
- `npm run devrank:spider -- --strategy community` executes only the Community Scan.
- Run the spider 2 times with the new strategy to seed diversity data.

## Timeline

- 2026-02-10T14:30:30Z @tobiu added the `enhancement` label
- 2026-02-10T14:30:31Z @tobiu added the `ai` label
- 2026-02-10T14:30:45Z @tobiu added parent issue #8930
- 2026-02-10T14:31:00Z @tobiu assigned to @tobiu
- 2026-02-10T14:37:41Z @tobiu referenced in commit `07c3f37` - "feat: Add CLI strategy option and interactive prompt to DevRank Spider (#9086)

- Added '-s, --strategy <type>' option to 'devrank:spider' CLI.
- Integrated 'inquirer' to prompt for strategy if not provided via CLI.
- Updated 'Spider.run' to handle forced strategy execution.
- Supported strategies: Random, Community, Keyword, Temporal, Stargazer, Core Search."
### @tobiu - 2026-02-10T14:41:32Z

**Input from Gemini 3 Pro:**

> ✦ Implemented CLI Strategy Selection.
> 
> 1.  **CLI Option**: `npm run devrank:spider -- --strategy community`
> 2.  **Interactive Mode**: If no flag is passed, `inquirer` prompts for selection:
>     -   Random (Default)
>     -   Community Scan
>     -   Keyword
>     -   Temporal
>     -   Stargazer
>     -   Core High Stars
> 
> Code updated in `Manager.mjs` and `Spider.mjs`.

- 2026-02-10T15:10:25Z @tobiu referenced in commit `13f84e0` - "fix: Resolve DevRank Spider bugs (422 Bio Signal Sort, Scalability) (#9086)

- communityTargets: Removed invalid entries ('SheCodes', 'womentechmakers') to prevent 404s.
- runCommunityScan: Added fallback to 'stargazer' scan if the target is a User instead of an Org.
- Bio Signals: Fixed 422 error by using valid repository sorts (stars, forks, updated) instead of user sorts.
- pickStrategy: Now splits Community/Bio signals 50/50 for better scalability.
- runSearch: Updated to accept dynamic sort/order parameters."
### @tobiu - 2026-02-10T15:11:05Z

**Input from Gemini 3 Pro:**

> ✦ Fixed critical bugs in Spider Strategy implementation:
> 
> 1.  **422 Unprocessable Entity (Bio Signals)**:
>     -   The 'Bio Signals' strategy was incorrectly using *User* sort keys (`followers`, `repositories`) on the *Repository* search endpoint.
>     -   **Fix**: Switched to valid repository sort keys (`stars`, `forks`, `updated`).
>     -   **Fix**: Updated `runSearch` to accept dynamic `sort` and `order` parameters instead of hardcoding `sort=stars`.
> 
> 2.  **Scalability & 404 Errors (Community Scan)**:
>     -   Several targets in `communityTargets` were invalid or User accounts, causing API 404s.
>     -   **Fix**: Cleaned up the list (Removed `womentechmakers`, `SheCodes`).
>     -   **Fix**: Added fallback logic to `runCommunityScan`: If `orgs/{name}/members` returns 404, it now attempts to treat the target as a User and runs a Stargazer scan.
>     -   **Refactor**: `pickStrategy` now splits the "Community" slot (15%) 50/50 between the static Org list and the dynamic Bio/Topic search to ensure long-term scalability.

- 2026-02-10T15:12:22Z @tobiu closed this issue

