---
id: 6600
title: 'apps/email: create a multi-window email client demo'
state: OPEN
labels:
  - enhancement
  - developer-experience
  - no auto close
assignees:
  - tobiu
createdAt: '2025-03-31T15:12:15Z'
updatedAt: '2026-06-23T05:37:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6600'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 6601 apps/email: basic setup using npm run create-app'
  - '[x] 6602 Email.view.MainContainer => Email.view.Viewport'
  - '[x] 6604 Email.model.Email'
  - '[x] 6605 Email.store.Emails'
  - '[x] 6606 Email.view.ViewportStateProvider'
  - '[x] 6608 Email.store.Emails: create a first json data file'
subIssuesCompleted: 6
subIssuesTotal: 6
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
---
# apps/email: create a multi-window email client demo

Goals:
* Using a buffered grid for the inbox data
* Custom component to display the email content
* Make it possible to move the email content into a new browser window
* Write email overlay (similar to GMail), animated full-screen expansion
* Make it possible to move the new email dialog into a new browser window

## Timeline

- 2025-03-31T15:12:15Z @tobiu added the `enhancement` label
- 2025-03-31T15:12:15Z @tobiu assigned to @tobiu
- 2025-03-31T15:13:25Z @tobiu added sub-issue #6601
- 2025-03-31T15:21:49Z @tobiu added sub-issue #6602
- 2025-03-31T15:25:17Z @tobiu added the `no auto close` label
- 2025-03-31T15:35:12Z @tobiu added sub-issue #6604
- 2025-03-31T15:58:52Z @tobiu added sub-issue #6605
- 2025-03-31T16:15:36Z @tobiu added sub-issue #6606
- 2025-04-01T10:48:39Z @tobiu added sub-issue #6608
- 2026-06-23T05:37:25Z @neo-gpt added the `developer-experience` label
### @neo-gpt - 2026-06-23T05:37:26Z

Status pass from current source.

Triaged per `ticket-triage` skill. Applied: `developer-experience`; retained existing `enhancement` / `no auto close` and the current `@tobiu` assignment. Stage retrospective passes: this is still a valid app-demo enhancement, but it is only partially implemented.

Observed in `apps/email`:

- `apps/email/view/MainView.mjs` already wires a 3-pane functional view with a `GridContainer`, `EmailsStore`, `RowModel`, row selection, and a rendered detail pane.
- `apps/email/view/ComposeView.mjs` exists and `MainView` conditionally mounts it from the Compose button.
- `apps/email/EPIC_PLAN.md` documents phases 1-3 as completed, phase 4 as the compose step, and phase 5 as the multi-window detach step with sub-tasks still undefined.

Remaining gaps against the original ticket goals:

- The inbox grid exists, but the current store is five inline records; the buffered/large-data demo value is not really exercised, and `apps/email/resources/data/emails.json` is not wired into the store.
- The email detail is rendered inline in `MainView`, but I found no detach/window handoff for moving the email content into a separate browser window.
- The compose form exists, but I found no Gmail-style animated full-screen overlay behavior.
- I found no detach/window handoff for moving the compose dialog into a separate browser window.

So the ticket should stay open as the canonical remaining lane for finishing the email demo's multi-window behavior rather than spawning a duplicate follow-up.


