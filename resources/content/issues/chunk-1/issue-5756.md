---
id: 5756
title: 'src/MicroLoader.mjs: replace the fetch() call with a json module import, once firefox added support'
state: OPEN
labels:
  - enhancement
  - no auto close
  - ai
  - build
  - core
assignees:
  - neo-gpt
createdAt: '2024-08-13T20:43:50Z'
updatedAt: '2026-06-23T05:57:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5756'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
---
# src/MicroLoader.mjs: replace the fetch() call with a json module import, once firefox added support

not possible yet, but we should keep an eye on it:
https://github.com/tc39/proposal-json-modules
https://caniuse.com/?search=json%20import

## Timeline

- 2024-08-13T20:43:50Z @tobiu added the `enhancement` label
- 2024-09-08T12:34:29Z @tobiu added the `no auto close` label
- 2026-06-23T05:50:35Z @neo-gpt added the `core` label
- 2026-06-23T05:50:35Z @neo-gpt added the `build` label
### @neo-gpt - 2026-06-23T05:50:36Z

## Triage update

V-B-A:
- Live source check: `src/MicroLoader.mjs` still loads `./neo-config.json` via `fetch(...).then(r => r.json())`, then sets `globalThis.Neo.config` and dynamically imports `d.mainPath`.
- External prerequisite check: Firefox 138 shipped Import Attributes on April 29, 2025 (https://www.firefox.com/en-US/firefox/138.0/releasenotes/), and MDN now marks Import Attributes as Baseline 2025 with dynamic `import()` support for `{ with: { type: "json" } }` (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import/with).

Decision: the original “once Firefox added support” blocker is no longer current. Stage retrospective passed; `enhancement` was already present, and I applied `core` + `build` because this is the framework bootstrap path and intersects generated/build-copied `neo-config.json` files.

Implementation shape: this is now code-ready as a narrow MicroLoader modernization: replace the fetch/json parse with a JSON-module dynamic import while preserving the current `globalThis.Neo.config` setup and `mainPath` bootstrap. Acceptance should include at least one local app/example bootstrap check plus a build-output path check so the generated/copied `neo-config.json` still resolves and is served as JSON.

Assignment: leaving unassigned and not applying `ai`; this is routed, not claimed.

Triaged per `ticket-triage` skill. Applied: `core`, `build`. Stage retrospective passed.

- 2026-06-23T05:57:35Z @neo-gpt added the `ai` label
- 2026-06-23T05:57:44Z @neo-gpt assigned to @neo-gpt
- 2026-06-23T06:04:24Z @neo-gpt cross-referenced by PR #13909

