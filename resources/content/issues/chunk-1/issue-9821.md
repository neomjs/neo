---
id: 9821
title: 'Enhancement: Neural Link VDOM Sync Primitives'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2026-04-09T11:33:54Z'
updatedAt: '2026-06-21T19:45:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9821'
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
blocking:
  - '[x] 8851 Exploration: Neural Link Driven Playwright Tests (Deep E2E)'
closedAt: '2026-06-21T19:45:27Z'
---
# Enhancement: Neural Link VDOM Sync Primitives

### Background
Currently, the AppWorker bridge tools (like `callMethod` and `setInstanceProperties`) resolve to `{success: true}` instantly upon finishing the Javascript action. Our Main Thread E2E tests are forced to blindly auto-retry CSS assertions because we have no topological sync mapping of when `me.update()` actually evaluates its VDOM delta in the Main Thread.

### Objective
- Enhance the MCP Server `neural-link` communication bridge. Provide developers with a mechanism to `await` the physical resolution of a VDOM update delta after injecting a property mutation, eliminating test race-conditions entirely.

## Timeline

- 2026-04-09T11:33:55Z @tobiu added the `enhancement` label
- 2026-04-09T11:33:56Z @tobiu added the `ai` label
- 2026-04-09T11:33:56Z @tobiu added the `architecture` label
- 2026-04-09T11:34:03Z @tobiu marked this issue as blocking #8851
- 2026-06-15T17:50:16Z @neo-opus-grace cross-referenced by #13373
### @neo-gpt - 2026-06-21T19:45:26Z

## Ticket Intake Classification — superseded by #12986

Live intake on 2026-06-21 re-checked the ticket, current Neural Link substrate, and successor topology.

Classification: `superseded`.

Evidence:
- #9821 asks for an awaitable "physical VDOM update delta after mutation" primitive on Neural Link.
- Current Neural Link already has adjacent inspection and verification surfaces (`query_vdom`, `inspect_component_render_tree`, `verify_component_consistency`, `observe_motion`, DOM rect sampling, and `set_instance_properties`), but no committed await-after-mutation contract.
- The correct successor design surface is #12986, the graduated VDOM delta-stream contract epic. It explicitly owns the shared delta vocabulary, capture API, replay fixture/versioning design, and later NL streaming rung.
- #9821 has no Contract Ledger and predates #12986's census-grounded grammar/kernel sequencing, so implementing it directly would risk inventing an NL-only wait primitive outside the shared delta-stream vocabulary.

Disposition:
- Closing this leaf as not planned / superseded.
- Future work should enter through #12986 sub-structure, specifically the replay/NL streaming rung after the kernel/capture/replay design gates, not through this standalone pre-census ticket.

- 2026-06-21T19:45:27Z @neo-gpt closed this issue

