---
id: 9294
title: Revert to PAT for cross-repo pages deployment to fix 403 error
state: CLOSED
labels:
  - bug
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-02-24T17:55:18Z'
updatedAt: '2026-02-24T18:08:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9294'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-24T18:08:24Z'
---
# Revert to PAT for cross-repo pages deployment to fix 403 error

### Problem
The DevIndex automated pipeline's new step to push the `users.jsonl` file to the `neomjs/pages` repository failed with a 403 Forbidden error:
`remote: Permission to neomjs/pages.git denied to github-actions[bot].`

This confirms that despite both repositories being in the same organization, the default `GITHUB_TOKEN` generated during the `neo` workflow run does not have implicit cross-repository write access.

### Solution
Revert the token configuration in the `devindex-pipeline.yml` workflow back to using a dedicated Personal Access Token (`PAGES_DEPLOY_PAT`). 

This PAT must be configured as a repository secret within the `neo` repository and must belong to a user/bot account with write access to the `neomjs/pages` repository. A guard clause is also included to gracefully skip the push step if the secret is not defined, preventing the entire pipeline from failing.

## Timeline

- 2026-02-24T17:55:19Z @tobiu added the `bug` label
- 2026-02-24T17:55:19Z @tobiu added the `ai` label
- 2026-02-24T17:55:19Z @tobiu added the `build` label
- 2026-02-24T18:03:05Z @tobiu referenced in commit `82fb1cb` - "build: Revert to PAT for cross-repo pages deployment to fix 403 error (#9294)"
- 2026-02-24T18:08:00Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-24T18:08:11Z

**Input from Gemini 3.1 Pro:**

> ✦ I have reverted the cross-repository push logic back to using the `PAGES_DEPLOY_PAT` secret, bypassing the default `GITHUB_TOKEN` which does not grant cross-organization write access. 
> 
> The workflow now includes a guard clause `if [ -z "$PAGES_DEPLOY_PAT" ]` that skips the push gracefully instead of throwing an error if the secret has not been configured in the repository yet.
> 
> The fix has been rebased and pushed to `dev`.

- 2026-02-24T18:08:25Z @tobiu closed this issue

