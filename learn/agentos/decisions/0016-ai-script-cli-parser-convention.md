# ADR 0016: AI Script CLI Parser Convention - Commander First

> Architectural Decision Record for #11817. Establishes Commander-backed
> parsing as the default for new and actively touched AI script CLI surfaces,
> while preserving legacy manual parsers until their behavior is actively
> modified or their failure semantics create observable friction.

| Attribute | Value |
|---|---|
| **Status** | Proposed - 2026-05-23 (transitions to Accepted on approved, green PR merge at the human merge gate) |
| **Author** | @neo-gpt (GPT-5 Codex), grounded in #11815 review friction, #11817 intake, package dependency evidence, and live parser-surface audit |
| **ADR classification** | ADR_REQUIRED: this decision governs future cross-script authoring and review behavior, so future agents need a graph-queryable decision record |
| **Resolves** | #11817 - *"Standardize AI script CLI parsing on Commander"* |
| **Supersedes** | The ticket-body statement `Decision Record Impact: none`; convention-only documentation in hidden script READMEs as the authority surface |
| **Informs** | Future AI script authoring, PR review of parser changes, and follow-up parser migrations when legacy surfaces are actively touched |
| **Anti-anchor for** | Reintroducing bespoke `parseArgs()` switch parsers in new AI scripts when Commander is already available |

---

## 1. Context

During PR #11815 review, team feedback surfaced recurring friction:
AI scripts kept introducing bespoke argument parsers even though
`commander` is already present in `package.json` and is used across repo CLI
surfaces.

The immediate PR #11815 issue was fixed in that PR. It converted
`ai/scripts/lifecycle/revalidationSweep.mjs` to a Commander-backed `createProgram()` /
`parseArgs()` surface and added focused tests for defaults, supplied values,
unknown flags, missing required family, and missing option values.

#11817 captures the durable convention so future agents can V-B-A against one
authority target instead of rediscovering the rule from PR comments or a local
README. A hidden `buildScripts/README.md` authority surface was rejected during
review because future agents would not reliably discover it. Because the
convention governs future cross-script authoring and review behavior, it belongs
in `learn/agentos/decisions/`.

## 2. Decision

New and actively touched AI script CLI surfaces MUST use Commander-backed
parsing by default.

This decision applies to CLI entry points in the Agent OS maintenance tooling
surface, especially `ai/scripts/**` and `ai/mcp/**`. Broader app scaffolding
and build/doc CLIs may already use Commander and are not the driver of this
ADR.

### 2.1 Default parser shape

The preferred parser shape is:

1. Import `Command` from the existing `commander` dependency.
2. Build a fresh `Command` instance per parser invocation when tests need
   isolation.
3. Export a pure `parseArgs(argv, env?)` or `createProgram()` helper when the
   CLI needs focused unit coverage.
4. Let Commander own help, unknown-option rejection, missing-option-value
   rejection, option defaults, and required-option semantics.
5. Keep business logic separate from parser construction so tests can validate
   parser behavior without running the full script.

### 2.2 Legacy parser posture

Existing bespoke parsers are not mass-migrated by this ADR.

Legacy manual parsers may remain when:

- their behavior is stable,
- the current ticket does not touch their parser surface,
- and tests already cover the failure semantics they claim to support.

They become future-touch conversion targets when a PR changes their options,
adds flags, edits validation semantics, or surfaces a parser-related review
failure. At that point, the author either converts the parser to Commander or
documents a narrow exception with tests for unknown flags, missing option
values, and help/default behavior.

### 2.3 Exception rule

A bespoke parser is allowed only when Commander cannot support the required
shape without larger architectural cost. The exception must be local and must
name the reason in the PR body or code comments. The exception still requires
tests for:

- valid defaults,
- valid supplied values,
- unknown flags,
- missing option values,
- and deterministic help or usage behavior when the script exposes help.

## 3. Parser Surface Audit

| Surface | Current parser posture | Disposition |
|---|---|---|
| `ai/scripts/lifecycle/revalidationSweep.mjs` | Commander-backed after PR #11815; tests cover defaults, supplied values, unknown flags, missing required family, and missing option values | `converted now` - precedent surface for this ADR |
| `ai/scripts/maintenance/kbPushClient.mjs` | Commander-backed parser with tests | `converted now` |
| `ai/scripts/diagnostics/mcpHealthcheck.mjs` | Commander-backed parser with tests | `converted now` |
| `ai/scripts/maintenance/defragChromaDB.mjs` | Commander-backed CLI | `converted now` |
| `ai/mcp/**/mcp-server.mjs`, `ai/mcp/client/mcp-cli.mjs`, `ai/mcp/server/neural-link/run-bridge.mjs` | Commander-backed server/client entry points | `converted now` |
| `ai/scripts/lint/lint-agents.mjs` | Bespoke parser with tests covering defaults, `--base`, help, and unknown-argument rejection | `legacy tolerated`; convert when parser semantics are next touched |
| `ai/scripts/lint/lint-skill-manifest.mjs` | Bespoke parser with tests | `legacy tolerated`; convert when parser semantics are next touched |
| `ai/scripts/migrations/migrateWakeSubscriptions.mjs` | Bespoke parser | `future-touch conversion target` |
| `ai/scripts/migrations/normalizeGraphIdentities.mjs` | Bespoke parser | `future-touch conversion target` |
| `ai/scripts/migrations/backfillChromaSharedUserId.mjs` | Bespoke parser | `future-touch conversion target` |
| `ai/scripts/maintenance/ingestTenant.mjs` | Bespoke parser with tests | `legacy tolerated`; convert when parser semantics are next touched |
| `ai/scripts/maintenance/restore.mjs` | Bespoke parser with tests covering required argument and unknown-flag rejection | `legacy tolerated`; convert only under a dedicated restore-parser lane |

This audit is intentionally not a global migration plan. It gives future
authors enough authority to avoid adding new bespoke parsers and enough
classification to avoid low-ROI churn in stable legacy scripts.

## 4. Consequences

### Positive

- Future parser changes have a single V-B-A authority target.
- New AI scripts inherit Commander failure semantics instead of
  reimplementing unknown-flag and missing-value handling.
- Tests can focus on parser contract instead of switch-statement edge cases.
- Legacy parser churn stays evidence-driven.

### Negative / residual

- Manual parser surfaces remain until touched, so parser style is not
  immediately uniform.
- Commander must be used in a testable shape; importing the shared global
  `program` can leak state across tests.
- Exception handling still relies on reviewer discipline unless a future guard
  is introduced.

## 5. Rejected Alternatives

| Alternative | Rejection rationale |
|---|---|
| Hidden README-only convention | Future agents will not reliably discover hidden README authority. |
| Mass-convert every bespoke parser now | Negative ROI. Some legacy parsers are stable and tested; a broad migration would obscure the rule and increase review burden. |
| Keep bespoke parsers if they are short | Parser line count is not the issue. The recurring failure is missing failure semantics and inconsistent defaults/help behavior. |
| Add an immediate lint guard | Deferred. A guard must avoid false positives for legacy tolerated parsers; this ADR first establishes the authority and audit taxonomy. |

## 6. V-B-A Pre-Flight for Future Authors

Before adding or modifying an AI script CLI parser:

1. Read this ADR.
2. Verify `package.json` still declares `commander`.
3. Check whether the touched script already uses Commander.
4. If adding a new parser, use Commander by default.
5. If touching a bespoke parser, either convert it or document why it remains a
   scoped exception.
6. Add or update parser tests for valid defaults, supplied values, unknown
   flags, and missing option values.
7. In PR review, reject new bespoke parser surfaces unless the exception rule in
   section 2.3 is satisfied.

## 7. Related

- #11817 - implementation ticket resolved by this ADR.
- PR #11815 - immediate Commander conversion and parser-test precedent for
  `ai/scripts/lifecycle/revalidationSweep.mjs`.
- PR #11749 / issue #11743 - repo-push MCP client precedent with a
  Commander-backed `ai/scripts/maintenance/kbPushClient.mjs` parser.
- `package.json` - declares `commander`.
- `ai/scripts/lifecycle/revalidationSweep.mjs` - current precedent parser
  surface.
- `test/playwright/unit/ai/scripts/lifecycle/revalidationSweep.spec.mjs` - current
  precedent parser test surface.
- ADR 0005 - ADR-at-graduation workflow and authority/workstream separation.
- ADR 0006 - ADRs as graph-queryable entities.

## 8. Status / Lifecycle

This ADR is proposed until the PR that introduces it is approved, green, and
merged at the human merge gate. Future work may supersede it only by naming a
specific parser-contract failure or dependency change that invalidates
Commander-first as the default.

Origin Session ID: `0c4a787e-00ad-4e98-ab09-29f0f1248489`

Retrieval Hint: `query_raw_memories("PR 11815 Commander parseArgs friction ADR 0016 parser convention")`
