---
id: 9756
title: 'Config: Inject missing modelProvider tracking'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2026-04-07T13:17:39Z'
updatedAt: '2026-04-07T13:18:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9756'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-07T13:18:17Z'
---
# Config: Inject missing modelProvider tracking

### Description
The configuration matrix (`config.mjs` and `config.template.mjs`) is missing the `modelProvider` definition which triggers silent failures when `SessionService` needs to execute summarizations (because the provider is completely undefined).
This ticket resolves the configuration parameter and deprecates the stale `embeddingProvider` override inside the testing suite (`SessionSummarization.spec.mjs`), mapping it to the new `neoEmbeddingProvider` properties instead.

## Timeline

- 2026-04-07T13:17:40Z @tobiu added the `bug` label
- 2026-04-07T13:18:13Z @tobiu referenced in commit `a606c74` - "fix: inject missing modelProvider tracking (#9756)"
- 2026-04-07T13:18:14Z @tobiu assigned to @tobiu
- 2026-04-07T13:18:17Z @tobiu closed this issue

