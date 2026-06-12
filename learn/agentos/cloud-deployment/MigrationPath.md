# Cloud-Native KB Ingestion — Migration Path

> **Status — Phase 3A invariant scaffold.** This guide describes the *invariant* upgrade story for existing single-repo Neo deployments; the tenant-config persistence shape it references is documented in [Configuration](./Configuration.md).

## The headline: zero-config for existing deployments

An existing single-repo Neo deployment — one repository, one KB indexing it — **requires no configuration change** to run on the cloud-ingestion substrate. The Phase 0/1 contracts were designed so that every new config key carries a default matching the pre-substrate behavior. A deployment that pulls the new code and changes nothing behaves byte-identically.

This is the load-bearing migration property: the substrate is **additive**, not a breaking change.

## What stays the same

| Concern | Pre-substrate | Post-substrate, zero-config |
|---|---|---|
| Source discovery | Hardcoded 10-source array | `SourceRegistry` auto-registers the same 10 sources (`useDefaultSources` defaults `true`) — same set, same order |
| Source input paths | Hardcoded in each Source class | `aiConfig.sourcePaths` carries Neo's default layout; each Source falls through to its hardcoded fallback if the config key is absent |
| Chunk identity | `neoRootDir`-relative `source` string | Path-identity tuple with `tenantId: 'neo-shared'`, `repoSlug: 'neo'` — the default tenant for a single-repo deployment |
| `npm run ai:sync-kb` output | — | Byte-equivalent under default config (the byte-equivalence test in #11660/#11661 is the regression guard) |

A single-repo deployment *is* a one-tenant deployment where the tenant is `neo-shared`. The cloud substrate doesn't add a code path the single-repo case has to navigate — it generalizes the existing path, with the existing behavior as the `N=1` default.

## What an operator opts into (cloud / multi-tenant mode)

Divergence from the single-repo default is **granular and opt-in**. An operator moving to a multi-tenant cloud deployment changes only what their topology requires:

- **Skip Neo's curated content** — set `aiConfig.useDefaultSources = false`. The `SourceRegistry` then contains only tenant-supplied Sources.
- **Unknown tenant repo shape** — set `aiConfig.rawRepoSource = true` to register the built-in raw-text fallback Source while a custom Source is still premature.
- **Different repo layout** — override only the affected `aiConfig.sourcePaths` keys (e.g. a tenant whose guides live under `docs/guides/tree.json` rather than `learn/tree.json`). Un-overridden keys still resolve to Neo defaults.
- **Register tenant Sources/Parsers** — populate `aiConfig.customSources` / `aiConfig.customParsers` with pre-imported tenant classes, or call `SourceRegistry.registerSource(...)` at runtime.
- **Spoof-rejection policy** — a multi-tenant operator should consider `aiConfig.spoofRejectionMode: 'reject'` (fail-closed) over the `'overwrite'` default (see [Security](./Security.md)).

Each of these is a local config edit; none requires a code fork.

## Config-template clone-sync

The new config keys (`useDefaultSources`, `rawRepoSource`, `useDefaultParsers`, `customSources`, `customParsers`, `sourcePaths`, `defaultTenantId`, `defaultRepoSlug`, `defaultVisibility`, `spoofRejectionMode`) live in `ai/mcp/server/knowledge-base/config.template.mjs` — the `SourceRegistry` keys via PR #11659, the `sourcePaths` keys via PR #11661, and the tenant-stamping keys via PR #11662. Each clone's local `config.mjs` is gitignored and copied from the template.

- **Zero-config deployments** need no local `config.mjs` edit — the runtime falls through to defaults when a key is absent.
- **Cloud / tenant-mode deployments** add the keys they need to their local `config.mjs`. A harness restart picks up the change (config modules load once per MCP process).

## Tenant-config persistence

How a multi-tenant deployment *stores* its per-tenant configuration — the `KnowledgeBaseTenantConfig` graph-node shape, the `kb-config.yaml` bootstrap-vs-canonical semantics, config-version metadata — is defined by #11637 and documented in **[Configuration](./Configuration.md)**. A deployment's tenant config resolves through three tiers: the `kb-config:<tenantId>` graph node → the `kb-config.yaml` bootstrap → the local `config.mjs` defaults. This tiering now also covers `tenantRepos` (the pull-mode polling config), resolved via `listConfiguredTenantRepos`.

## Breaking-change inventory

There are **no breaking changes** for an existing single-repo deployment. The substrate is additive end-to-end. The only "migration" a single-repo operator performs is `git pull` — the defaults handle the rest.

For a deployment that *was* manually patching the hardcoded source array or per-source paths (a pre-substrate fork): un-fork. Move the customization into `aiConfig.customSources` / `aiConfig.sourcePaths`. The registry + config substrate exists precisely to retire those forks.

## Deprecation timeline

No deprecations in Phase 0/1. The legacy single-`source`-string chunk metadata is superseded by the path-identity tuple, but `tenantId: 'neo-shared'` / `repoSlug: 'neo'` is the deterministic default — no migration window, no dual-read shim. A KB re-sync (`npm run ai:sync-kb`) re-stamps all chunks under the tuple on the next run.

## Related

- [Overview](./Overview.md) — the contract split + default-source inheritance.
- [Security](./Security.md) — tenant-isolation invariants + spoof-rejection policy choice.
- [Configuration](./Configuration.md) — tenant-config persistence (#11637).
