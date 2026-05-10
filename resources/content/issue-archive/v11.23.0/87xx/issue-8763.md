---
id: 8763
title: 'Docs: Update FourEnvironments.md for Native ESM Builds'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-01-17T18:25:55Z'
updatedAt: '2026-01-17T18:27:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8763'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-17T18:27:45Z'
---
# Docs: Update FourEnvironments.md for Native ESM Builds

## Description
The `learn/benefits/FourEnvironments.md` guide needs to be updated to reflect the recent architectural shift to Native ESM Output for Webpack builds (`dist/production` and `dist/development`).

The current documentation implies traditional bundling (IIFE/wrappers) and "single-file" deployment. We need to clarify that:
1.  Webpack now generates **Native ES Module bundles**.
2.  Deployment involves optimized bundles plus external configuration files (like `DefaultConfig.mjs`), rather than a strictly monolithic single file.

## Tasks
1.  Update `learn/benefits/FourEnvironments.md`:
    -   Refine the `dist/production` section to explicitly mention "Native ES Module bundles".
    -   Adjust language around "single-file deployment" to be more accurate (e.g., "Simplified Bundle Deployment").
    -   Ensure the distinction between `dist/esm` (individual modules) and `dist/production` (bundled modules) remains clear.

## Acceptance Criteria
-   Documentation accurately reflects the new Native ESM build architecture.
-   The guide remains accessible and high-level.

## Timeline

- 2026-01-17T18:25:56Z @tobiu added the `documentation` label
- 2026-01-17T18:25:56Z @tobiu added the `ai` label
- 2026-01-17T18:27:23Z @tobiu referenced in commit `1976f07` - "docs: Update FourEnvironments.md to reflect Native ESM Builds (#8763)"
### @tobiu - 2026-01-17T18:27:26Z

**Input from Gemini 3 Pro:**

> ✦ I have updated `learn/benefits/FourEnvironments.md` to reflect the new Native ESM build architecture.
> 
> **Changes:**
> -   Updated `dist/production` description to specify "Native ES Module bundles" and "Simplified Bundle Deployment".
> -   Updated `dist/development` to specify "bundled Native ES Modules".
> 
> This ensures the documentation aligns with the recent Webpack configuration changes.

- 2026-01-17T18:27:28Z @tobiu assigned to @tobiu
- 2026-01-17T18:27:45Z @tobiu closed this issue

