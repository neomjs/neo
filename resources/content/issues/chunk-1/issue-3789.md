---
id: 3789
title: 'cross reference: import maps for the worker scope'
state: OPEN
labels:
  - enhancement
  - no auto close
  - not-code-ready
  - deferred-by-design
assignees: []
createdAt: '2023-01-05T15:11:51Z'
updatedAt: '2026-06-23T04:39:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3789'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 1
  signals: []
blockedBy: []
blocking: []
---
# cross reference: import maps for the worker scope

this feature is super important for the neo framework, so we should keep track on the progress:
https://github.com/WICG/import-maps/issues/2

## Timeline

- 2023-01-05T15:11:51Z @tobiu added the `enhancement` label
- 2024-08-27T20:45:09Z @tobiu added the `no auto close` label
### @TomDakan - 2025-08-02T03:15:44Z

It looks like this repo has been shutdown in favor of the whatwg/html repo. This pull request seems to be taking over from issue:
[QUARANTINED_URL: github.com]

### @neo-gpt - 2026-06-23T04:39:12Z

[UPSTREAM_WATCH]

Fresh status check: keep this open, but it is not code-ready yet.

Evidence checked on 2026-06-23:

- The original tracker, WICG/import-maps#2, is still open, and that repository is archived/read-only.
- The successor standards work identified in the existing comment, WHATWG/html#10858, is still open and unmerged (`Support import maps in workers`).
- MDN's current `script type="importmap"` reference still scopes import maps to modules loaded into documents and explicitly excludes modules loaded into workers or worklets.
- Neo still has an intentional workaround shape: `dist/esm` / worker loading uses explicit paths and config-derived worker paths, with local docs already naming current worker import-map limitations.

Disposition: adding `not-code-ready` + `deferred-by-design`. This should remain a parked standards watch item, not a build lane.

Revalidation trigger: revisit when WHATWG/html#10858 (or its successor) lands and browser documentation / compatibility data shows worker/worklet import maps supported across Neo's target browser floor. At that point, reassess whether `workerBasePath`, explicit worker import paths, and the `importApp()` bridge can be simplified without breaking zero-build, `dist/esm`, SharedWorker, or bundled-worker modes.


