---
id: 9238
title: Integrate Opt-In Service into Hourly Pipeline & Document Architecture
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-22T00:19:02Z'
updatedAt: '2026-02-22T00:21:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9238'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-22T00:21:19Z'
---
# Integrate Opt-In Service into Hourly Pipeline & Document Architecture

### Description
Integrate the newly created `OptIn` service into the automated `devindex-pipeline.yml` GitHub Action and finalize the architectural documentation.

### Requirements
1. **Pipeline Integration:** Add a step to execute the Opt-In service in `.github/workflows/devindex-pipeline.yml`.
2. **Execution Order:** Ensure `devindex:optin` runs **before** `devindex:optout`. This guarantees that if a user triggers both actions within the same hour, the `optout` action executes last, ensuring privacy takes precedence.
3. **NPM Script:** Add `"devindex:optin": "node apps/devindex/services/cli.mjs optin"` to `package.json`.
4. **Documentation:** Create and refine `learn/guides/devindex/SpiderOptIn.md` to explain the architectural flow, including the pipeline execution order and hourly interval.

## Timeline

- 2026-02-22T00:19:02Z @tobiu added the `documentation` label
- 2026-02-22T00:19:03Z @tobiu added the `enhancement` label
- 2026-02-22T00:19:03Z @tobiu added the `ai` label
- 2026-02-22T00:19:23Z @tobiu assigned to @tobiu
- 2026-02-22T00:20:17Z @tobiu referenced in commit `916358b` - "feat: Integrate Opt-In Service into Hourly Pipeline & Document Architecture (#9238)"
### @tobiu - 2026-02-22T00:20:38Z

**Input from Gemini 3 Pro:**

> ✦ The Opt-In service has been successfully integrated into the DevIndex backend pipeline and fully documented.
> 
> ### Changes Implemented:
> 1. **GitHub Action Pipeline (`devindex-pipeline.yml`):**
>    - Added a new step: `Run DevIndex Opt-In`.
>    - **Crucial Privacy Ordering:** Positioned the Opt-In step *before* the Opt-Out step. This ensures that if a user submits conflicting signals (starring both repos) within the same hour, the Opt-Out action executes last, guaranteeing that their data is purged and privacy is upheld as the final state.
> 2. **NPM Scripts (`package.json`):**
>    - Added `"devindex:optin": "node ./apps/devindex/services/cli.mjs optin"` to enable the pipeline integration.
> 3. **Architecture Documentation (`SpiderOptIn.md`):**
>    - Documented the logic flows for "Quick Star" vs "Issue Templates", focusing heavily on how blocklist reversals are securely handled based on identity verification.
>    - Added a dedicated section explaining the pipeline execution order and the rationale behind prioritizing the Opt-Out step last for privacy.
> 
> This feature is now complete and active.

- 2026-02-22T00:21:19Z @tobiu closed this issue

