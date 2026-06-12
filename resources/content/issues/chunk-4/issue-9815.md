---
id: 9815
title: Sanitize DreamService Handoff Formatting and Filter Config Lifecycle Gaps
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-04-09T10:04:05Z'
updatedAt: '2026-04-09T10:04:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9815'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-09T10:04:22Z'
---
# Sanitize DreamService Handoff Formatting and Filter Config Lifecycle Gaps

### The Problem
During the `sandman_handoff.md` generation logic in `DreamService`, escaped newlines (`\\n`) within the capability gaps string were not being sanitized, rendering as raw string tokens instead of proper indentation.
Additionally, the autonomous GAP architecture logic was aggressively flagging internal Neo.mjs config lifecycle hooks (e.g., `beforeGetWrapperStyle`, `afterSetData`) as "Capabilities Missing Documentation/Tests," despite them being auto-generated or intentionally internal mechanisms.

### The Architectural Reality
The issue was identified in `DreamService.mjs` across two locations:
1. When generating `docGap` and `testGap`, the capability gap generator checked all `METHOD` graph nodes universally.
2. During TTL markdown synthesis, `capabilityGap.replace(/\n/g, ' ')` failed to target string-literal `\\n` entries written prior to SQLite persistence.

**File fixed:**
- `ai/mcp/server/memory-core/services/DreamService.mjs`

### The Fix
1. Implemented a filtering constraint testing `METHOD` names against the regex regex pattern `/^(beforeGet|beforeSet|afterSet)[A-Z]/` to skip Neo.mjs config lifecycle hooks during capability inference.
2. Augmented the formatting constraint during `synthesizeGoldenPath` to explicitly target and clean `\\n` literal string references out of the raw node SQLite properties.

## Timeline

- 2026-04-09T10:04:06Z @tobiu added the `bug` label
- 2026-04-09T10:04:06Z @tobiu added the `ai` label
- 2026-04-09T10:04:16Z @tobiu assigned to @tobiu
- 2026-04-09T10:04:20Z @tobiu referenced in commit `d7d2cff` - "fix(ai): Sanitize DreamService Handoff Formatting and Filter Config Lifecycle Gaps (#9815)"
### @tobiu - 2026-04-09T10:04:21Z

The native regex filter string is now omitting config lifecycle methods, and literal node breaks are cleaned correctly. Code has been merged and pushed.

- 2026-04-09T10:04:23Z @tobiu closed this issue

