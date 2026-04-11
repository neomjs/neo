---
id: 9881
title: Fix Data Sync Pipeline Crash by Disabling Unconditional Chroma Daemon Startup
state: CLOSED
labels:
  - bug
  - ai
assignees: []
createdAt: '2026-04-11T10:17:31Z'
updatedAt: '2026-04-11T10:32:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9881'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-11T10:32:53Z'
---
# Fix Data Sync Pipeline Crash by Disabling Unconditional Chroma Daemon Startup

### Description
The GitHub Actions data sync pipeline has critically broken with an `ENOENT` error because `labels.mjs` triggers a `knowledge-base` service load via the `ai/services.mjs` SDK.

### Root Cause
1. `labels.mjs` uses `import {GH_LabelService} from '../../../ai/services.mjs'`.
2. This imports `DatabaseLifecycleService.mjs` which, upon initialization (`initAsync`), unconditionally calls `await this.startDatabase()`.
3. This attempts to spawn `chroma`, which doesn't exist on the standard GitHub Runner used for the data sync.
4. While `autoSync = false` handles *crawling*, there is no config equivalent for daemon startup (`autoStartDatabase` / `autoStartInference`), causing lifecycle processes to spawn blindly even when only specific SDK exports (like `GH_LabelService`) are required by build scripts.

### Proposed Fix
- Add `autoStartDatabase` and `autoStartInference` flags to MCP configuration files (`knowledge-base` & `memory-core`).
- Explicitly check these config values in `DatabaseLifecycleService.initAsync()`, `ChromaLifecycleService.initAsync()`, and `InferenceLifecycleService.initAsync()`.
- Set these new config variables to `false` in the core SDK (`ai/services.mjs`) to ensure all CLI build pipelines remain headless by default.

## Timeline

- 2026-04-11T10:17:33Z @tobiu added the `bug` label
- 2026-04-11T10:17:34Z @tobiu added the `ai` label
- 2026-04-11T10:23:55Z @tobiu referenced in commit `5727659` - "fix(ai): Implement targeted daemon auto-start specific environment variables (#9881)

- Modifies config.template.mjs for knowledge-base and memory-core to use strictly targeted 'NEO_' prefixed environment variables.
- NEO_KB_AUTO_START_DATABASE
- NEO_MEM_AUTO_START_DATABASE
- NEO_MEM_AUTO_START_INFERENCE
- Updates lifecycle managers to check flags before spawning local binaries.
- Overrides properties in ai/services.mjs for headless build pipeline capability."
- 2026-04-11T10:24:16Z @tobiu cross-referenced by PR #9882
- 2026-04-11T10:32:53Z @tobiu referenced in commit `1c608ec` - "fix(ai): Implement targeted daemon auto-start specific environment variables (#9881) (#9882)

- Modifies config.template.mjs for knowledge-base and memory-core to use strictly targeted 'NEO_' prefixed environment variables.
- NEO_KB_AUTO_START_DATABASE
- NEO_MEM_AUTO_START_DATABASE
- NEO_MEM_AUTO_START_INFERENCE
- Updates lifecycle managers to check flags before spawning local binaries.
- Overrides properties in ai/services.mjs for headless build pipeline capability."
- 2026-04-11T10:32:53Z @tobiu closed this issue
- 2026-04-11T13:21:10Z @tobiu referenced in commit `eef08df` - "fix: Ticket markdown rendering by adding blank lines for marked.js (#9881)"
- 2026-04-11T13:21:25Z @tobiu cross-referenced by PR #9883
- 2026-04-11T13:39:25Z @tobiu referenced in commit `a0574bb` - "fix: Ticket markdown rendering by adding blank lines for marked.js (#9881)"
- 2026-04-11T13:44:37Z @tobiu referenced in commit `e6800b9` - "agent/9881 disable daemon autostart (#9883)

* fix: Ticket markdown rendering by adding blank lines for marked.js (#9881)

* fix: Resolve missing appName/windowId propagation in CardLayout & update data"

