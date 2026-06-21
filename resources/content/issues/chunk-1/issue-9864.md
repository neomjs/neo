---
id: 9864
title: Autonomous PR Format Auditing via DreamService
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-04-10T11:12:07Z'
updatedAt: '2026-06-21T07:57:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9864'
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
# Autonomous PR Format Auditing via DreamService

**The Problem:**
Agents and contributors are now formally required (via `AGENTS.md`) to include "Fat Ticket" markdown syntax and explicit `[ARCH_ALIGNMENT]` logic within Pull Request bodies and iterative follow-up comments. Unenforced rules, however, rapidly decay. Without programmatic gating, non-compliant "ghost diffs" or malformed PR bodies will corrupt the Native Edge Graph over time.

**The Architectural Reality:**
The Swarm Architecture delegates background task processing to the `DreamService.mjs` daemon (specifically leveraging the `PullRequestSyncer`). Currently, the syncer downloads PRs and establishes their graph connections, but blindly assumes the embedded Markdown structurally complies with the A2A protocols.

**Avoided "Gold Standards" / Traps:**
We must deliberately avoid standard external GitHub Actions (e.g., traditional CI/CD linters) or generic bots for this format check. The verification mechanism MUST exist securely inside our autonomous `DreamService` Node.mjs / SQLite environment. Retaining the analysis natively allows the daemon to autonomously generate internal `[TOOLING_GAP]` nodes in the matrix, empowering subsequent agents to resolve the non-compliance dynamically without leaving the OS.

**Goals:**
1. Enhance the `PullRequestSyncer` pipeline within `DreamService` to regex/parse incoming PR Markdown for compliance.
2. Assert the presence of Swarm-mandated metrics (e.g., `Resolves #`, execution variables).
3. Construct the logic for automatic graph logging or automated PR rejection responses.

## Timeline

- 2026-04-10T11:12:08Z @tobiu added the `enhancement` label
- 2026-04-10T11:12:09Z @tobiu added the `ai` label
### @neo-opus-vega - 2026-06-21T07:57:43Z

## Intake triage (V-B-A'd against current `dev`, 2026-06-21) — `not-code-ready`: a rules-SSOT decision gates this

Sampled this as a potential pure-core slice (the ada #13725 pattern). V-B-A surfaced a design prerequisite that should be resolved before code:

**The format-rules have no canonical reusable SSOT.** They live only in `.github/workflows/agent-pr-body-lint.yml` (the existing GitHub-Action lint) — `grep` finds no reusable `*pr-body*` rules module in `buildScripts/` or `ai/services/`. So this ticket's graph-native `DreamService`/`PullRequestSyncer` audit can't just "consume the rules" — there are none to consume as a module.

**The fork to decide first (design, not blind build):**
1. **Extract the rules to a canonical SSOT module** (e.g. `ai/.../prBodyFormatRules.mjs` returning `{compliant, violations}` from a body string), then have **both** the GA workflow **and** the new `DreamService` audit consume it. This is the DRY-correct shape but it's a **refactor of the live `agent-pr-body-lint.yml` CI gate** (regression-risk — that gate runs on every agent PR), so it needs care + verification, not an autonomous blind edit.
2. **Re-encode the rules in the audit** — rejected: two sources of truth, the exact rule-decay this ticket is trying to prevent.

So the bounded-implementable slice (a pure `auditPrBodyFormat(body)` core + tests) is real, but it's the *SSOT-extraction* — which couples to the live CI gate. Recommend: a short design note settling the SSOT location + the GA-consumes-the-module migration, then the pure core + tests land cleanly, then the `PullRequestSyncer` integration (the graph-native half) follows. The "avoid external GitHub Actions" trap (per the body) = the audit is graph-native, but the *rules* still want one SSOT both paths share.

Flagging as needs-design so it isn't blind-picked-up as a clean slice. (Triage only — not claiming; surfaced while checking for a buildable lane.) — Vega (@neo-opus-vega, claude-opus-4-8)


