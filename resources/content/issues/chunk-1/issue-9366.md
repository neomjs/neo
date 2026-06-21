---
id: 9366
title: Chrome Windows Color app
state: OPEN
labels:
  - bug
assignees: []
createdAt: '2026-03-06T10:30:01Z'
updatedAt: '2026-06-21T14:08:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9366'
author: kmunk-klarso
commentsCount: 2
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
# Chrome Windows Color app

widget nach rausziehen lässt sind reintegrieren

## Timeline

- 2026-03-06T10:30:03Z @kmunk-klarso added the `bug` label
### @SergioChan - 2026-03-20T18:00:10Z

Thanks for reporting this.

I want to work on a fix, but I can��t reliably reproduce from the current description yet. Could you share:

1. Exact steps/click path that trigger the issue
2. What behavior you expected vs what actually happened
3. Browser + OS version (especially Chrome on Windows)
4. Any console errors/screenshots if available

With that, I can put together a minimal, targeted patch.


### @tobiu - 2026-03-25T16:18:53Z

Hi @SergioChan,

if I recall it correctly, Katharina meant this one:
https://youtu.be/KIZ1rxRuRcQ

It is definitely still broken here: https://neomjs.com/#/home (even on mac os), and several local changes should have fixed it. well, at least on Mac OS it works again.

In case you want to take a look:

1. Fork the repo
2. npm i
3. npm run build-all
4. npm run server-start
5. open http://localhost:8080/apps/portal/#/home or alternatively http://localhost:8080/apps/colors/

**What should work:**

Drag an in-app widget over the container border, it should transform into a popup window without breaking the drag operation. You can continue to drag it back over the origin-container, and it should transform back into an in-app widget.

**What does not work yet:**

If you drop the popup window outside the main app. Then start a new drag operation and move the popup window directly back over the main app. This is a planned item for the infinite canvas concept though. gut feeling: around neo v13.

@kmunk-klarso please let us know, in case the ticket was related to something else.

@SergioChan If could validate that this demo now also works on Windows OS locally, this would be of great help. Right now, I don't even have a VM running to test it there.

Best regards,
Tobias

- 2026-06-21T14:14:39Z @neo-opus-vega cross-referenced by #13774
- 2026-06-21T14:32:47Z @tobiu referenced in commit `5c5ad39` - "chore(ai): redact confidential deployment identifier from current content mirrors (#13774) (#13775)

Scrubs the identifier from 5 current (non-archive) resources/content/ mirrors (1 discussion + 4 PR mirrors), replacing with the operator-locked generic placeholder. The contributor-handle ticket #9366 is intentionally untouched (legitimate external author). Archive mirrors + the sync-pipeline write-guard are tracked separately. Authored by @neo-opus-vega (Vega)."

