# Env-Var Rename Rule (Clean-Slate Hard-Cut)

*(Codified per [#10826](https://github.com/neomjs/neo/issues/10826) — sub-issue of [Epic #10822](https://github.com/neomjs/neo/issues/10822) Config substrate cleanup. Loaded conditionally via the trigger in `pull-request-workflow.md §1.1` when a PR touches env-var resolvers.)*

If your PR adds, removes, or renames an env var that the substrate reads from `process.env`, you MUST follow the **clean-slate hard-cut rule** rather than ship a deprecation chain.

## Hard-cut rule (one shot)

Rename in code + rename in `.env` + rename in tests + ship together in ONE PR. No `legacyEnvVar` parameters, no `'deprecated; use X'` warnings on boot, no fallback chains. Operators take the small migration cost ONCE per rename.

## Why no deprecation chains

- The realistic operator population for the Agent OS substrate is the swarm (named AI maintainers + the human commander) plus selected partners deploying Neo. Multi-window deprecation patterns assume an external user base across release windows; that assumption doesn't apply here.
- Empirical anchor: legacy env vars deprecated in [#10808](https://github.com/neomjs/neo/issues/10808) / [#10810](https://github.com/neomjs/neo/issues/10810) / [#10814](https://github.com/neomjs/neo/issues/10814) were never shipped in a released npm version; the "compatibility window" was protecting users-who-don't-exist.
- KISS over backwards-compat-without-released-users (see `AGENTS.md §13` substrate-accretion-defense).

## Reviewer enforcement

PRs that introduce `legacyEnvVar` parameters, `console.warn` deprecation calls in resolvers, or multi-layer fallback chains for env-var renames get **Request Changes** at first cycle. The author either:

- (a) Refactors to hard-cut (rename + `.env` migration in same PR), OR
- (b) Documents an explicit released-version compat contract that the chain protects (cite the released npm version + the user surface area).

## Released-version compat exception

If the env var IS in a released npm version's documented operator surface AND a real user migration window is needed, reviewer + author MUST file an `epic` ticket with explicit sunset trigger (commit SHA / version / N-cycles-from-merge) before merging the deprecation chain. The "deprecation window" semantics get a concrete end-state, not indefinite drift.

## Note on env-var precedence

The resolver pattern `env || configDefault` correctly prioritizes env vars over `config.mjs` defaults. This precedence is **load-bearing** for Playwright unit-testing isolation, sub-agent runtime overrides, container-bind injection, and operator one-off testing. The hard-cut rule does NOT invert this precedence — it eliminates the *deprecated-name fallback chain* that runs *underneath* env-var resolution. Env vars stay first; `config.mjs` defaults stay second; legacy-name aliases stop existing.
