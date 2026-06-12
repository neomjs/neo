---
id: 8310
title: 'Feat: Environment-Aware Neural Link Config'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-04T13:19:06Z'
updatedAt: '2026-01-04T13:23:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8310'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-04T13:23:35Z'
---
# Feat: Environment-Aware Neural Link Config

**Context:**
Currently, `Neo.config.useAiClient` is a boolean. This means the Neural Link is either always on or always off for a given configuration file. To support safer deployments (e.g., enabling AI only in 'development' but not 'production' using the same config file), we need environment-aware configuration similar to `useServiceWorker`.

**Scope:**
1.  **Update `src/DefaultConfig.mjs`:**
    -   Change `useAiClient` type definition to `Boolean|String|String[]`.
    -   Document the usage (e.g., `'development'`, `['development', 'dist/esm']`).
2.  **Update `src/worker/App.mjs`:**
    -   In `onRegisterNeoConfig`, implement logic to compare `useAiClient` value against `Neo.config.environment`.
    -   Only import/initialize `Neo.ai.Client` if the environment matches.

**Goal:**
Allow developers to restrict Neural Link access to specific environments.

## Timeline

- 2026-01-04T13:19:07Z @tobiu added the `enhancement` label
- 2026-01-04T13:19:07Z @tobiu added the `ai` label
- 2026-01-04T13:19:07Z @tobiu added the `architecture` label
- 2026-01-04T13:19:27Z @tobiu added parent issue #8169
- 2026-01-04T13:19:40Z @tobiu assigned to @tobiu
- 2026-01-04T13:22:59Z @tobiu referenced in commit `fd5152e` - "feat(ai): Environment-Aware Neural Link Config (#8310)

- Update Neo.config.useAiClient to support Boolean, String, or String[].
- Implement environment validation in App.mjs to conditionally load Neo.ai.Client."
- 2026-01-04T13:23:36Z @tobiu closed this issue

