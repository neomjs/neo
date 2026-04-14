---
id: 9997
title: 'enhancement: Prioritize latest active sessions in summarization pipeline'
state: CLOSED
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-04-14T12:46:32Z'
updatedAt: '2026-04-14T12:52:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9997'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-14T12:52:24Z'
---
# enhancement: Prioritize latest active sessions in summarization pipeline

## Problem
The `SessionService` processes active sessions using `findSessionsToSummarize` by collecting them into a map and iterating over them with `Object.keys()`. This groups candidate sessions but processes them in an arbitrary iteration order rather than chronological priority. As a result, the newest active sessions might wait while older unsummarized items in the backlog are digested.

## Solution
- Refactored `findSessionsToSummarize` to track the `lastActivity` (highest memory timestamp) for every categorized session.
- Explicitly applied a descending sort to the `sessionsToUpdate` array based on the `lastActivity` timestamps prior to returning it.
- Authored a new Playwright test in `SessionSummarization.spec.mjs` with simulated session intervals to strictly enforce that the newest session is processed internally before older sessions.

## Impact
Future agent iterations will accurately ingest their freshest historical context first natively out of the gate. This resolves "Zero-State Amnesia" for restarted sessions and guarantees token allocation prioritizes immediate memory over the backlog.

## A2A Context
Origin Session ID: 56268bb1-7e01-4e49-bd2b-26b3a3208797

## Timeline

- 2026-04-14T12:46:33Z @tobiu added the `enhancement` label
- 2026-04-14T12:46:33Z @tobiu added the `ai` label
- 2026-04-14T12:47:15Z @tobiu referenced in commit `31b24b4` - "enhancement: Prioritize latest active sessions in summarization pipeline (#9997)"
- 2026-04-14T12:47:17Z @tobiu cross-referenced by PR #9998
- 2026-04-14T12:52:24Z @tobiu referenced in commit `a1eacd6` - "enhancement: Prioritize latest active sessions in summarization pipeline (#9997) (#9998)"
- 2026-04-14T12:52:24Z @tobiu closed this issue

