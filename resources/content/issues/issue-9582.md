---
id: 9582
title: 'Bug: Webpack fails due to unanchored `webpackInclude` picking up Node modules'
state: CLOSED
labels:
  - bug
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-03-27T13:58:50Z'
updatedAt: '2026-03-27T14:18:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9582'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-27T14:18:04Z'
---
# Bug: Webpack fails due to unanchored `webpackInclude` picking up Node modules

The removal of the `^` anchor in `#9580` and `#9581` resolved the path matching for app and chunk resolution (since context strings begin with `./`), but removing the anchor completely caused the regexes to broadly match backend Node scripts if their paths contained the keywords further down the substring tree.

For example:
- `./ai/examples/test-agent.mjs` matched `examples/`
- `./apps/devindex/services/Manager.mjs` matched `apps/`
- `./examples/form/field/fileupload/server.mjs` matched `examples/`

This resulted in Webpack attempting to bundle Node core modules (`node:stream`, `node:util`), throwing `UnhandledSchemeError`.
The fix anchors the regex correctly with `^\.\/` to strictly target the intended folders at the root, and adds `server\.mjs` and `devindex\/services` to `webpackExclude` as negative safeties against mixing backend scripts into worker chunk maps.

## Timeline

- 2026-03-27T13:58:52Z @tobiu added the `bug` label
- 2026-03-27T13:58:52Z @tobiu added the `ai` label
- 2026-03-27T13:58:52Z @tobiu added the `build` label
- 2026-03-27T14:18:04Z @tobiu closed this issue
- 2026-03-27T14:18:22Z @tobiu assigned to @tobiu

