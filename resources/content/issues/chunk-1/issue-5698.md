---
id: 5698
title: 'tooltip.Base: singleton mode => honor nested themes'
state: OPEN
labels:
  - enhancement
  - developer-experience
  - no auto close
  - ai
  - core
assignees:
  - neo-gpt
createdAt: '2024-08-06T06:37:13Z'
updatedAt: '2026-06-28T19:57:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5698'
author: tobiu
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
# tooltip.Base: singleton mode => honor nested themes

@ExtAnimal 

right now, the tooltip is a direct child of the viewport => using the top-level theme.

since we can nest themes, the tooltip needs to check if the target has an own theme and if not walk up the vdom or dom tree to check for `neo-theme-x` css selectors. use the closest match.

## Timeline

- 2024-08-06T06:37:13Z @tobiu added the `enhancement` label
- 2024-10-07T21:54:46Z @tobiu added the `no auto close` label
- 2026-06-23T05:46:20Z @neo-gpt added the `core` label
- 2026-06-23T05:46:20Z @neo-gpt added the `developer-experience` label
### @neo-gpt - 2026-06-23T05:46:22Z

Status pass from current source.

Triaged per `ticket-triage` skill. Applied: `core`, `developer-experience`; retained existing `enhancement` / `no auto close`. Stage retrospective passes: the singleton tooltip still needs to honor the hovered target's nested theme.

Current findings:

- `src/tooltip/Base.mjs#createSingleton()` creates one shared tooltip per app and reconfigures it on `targetOver` from `target?._tooltip` or `data-neo-tooltip`.
- That `targetOver` path resets old config and applies the hovered target's tooltip config, but does not derive or set a theme from the hovered target.
- `src/component/Base.mjs#getTheme()` already implements the needed closest-theme walk: own `cls`, then parent VDOM nodes, then the window/app default theme.
- `src/component/Base.mjs#createTooltip()` keeps shared-tooltip widgets as plain config on `me._tooltip` and adds `neo-uses-shared-tooltip`; the singleton remains mounted under the app/viewport rather than under the target's themed subtree.

Recommended close target: on singleton `targetOver`, set the shared tooltip's `theme` from the active target before showing it, preferably via `target.getTheme()` with a DOM-path fallback for delegated `data-neo-tooltip` cases where the event target is not a component root. Add focused coverage proving that the same singleton changes theme when hovering targets in different nested theme scopes, without regressing `ownInstance` tooltip behavior.

### @neo-gpt - 2026-06-28T19:57:46Z

Triaged per `ticket-triage` skill for agent pickup.

The prior June 23 status pass already applied `core` + `developer-experience` and confirmed the premise against current source. I am now moving this into the agent work queue, so I am adding the mandatory `ai` label and self-assigning before `ticket-intake` / branch work.

Intake snapshot: no successor PR found; KB points back to this same ticket as the active nested-theme singleton-tooltip lane; current `src/tooltip/Base.mjs#createSingleton()` still reconfigures from the hovered target without deriving `theme`; `src/component/Base.mjs#getTheme()` remains the closest-theme primitive to reuse.

- 2026-06-28T19:57:53Z @neo-gpt added the `ai` label
- 2026-06-28T19:57:54Z @neo-gpt assigned to @neo-gpt
- 2026-06-28T20:04:49Z @neo-gpt cross-referenced by PR #14301

