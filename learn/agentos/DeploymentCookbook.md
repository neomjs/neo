# Deployment Cookbook: Agent OS Cloud Deployment Authority

This cookbook is the F1 deployment authority for Epic #11720. It describes the
current Agent OS deployment baseline, the D0-decided target topology, and the
handoffs that are still owned by the active #11720 implementation subs.

This is not the day-0 tutorial. The executable first-run path lives in
[Day-0 Cloud Deployment Tutorial](cloud-deployment/Day0Tutorial.md). For the
older shared-KB/MC background and threat model, see
[Shared Deployment MVP](SharedDeployment.md). For the cloud topology decision
record, see [ADR 0014](decisions/0014-cloud-deployment-topology-and-scheduler-task-taxonomy.md).

## Section 1: Current Baseline vs Target Topology

The current reference compose file in [`ai/deploy/`](../../ai/deploy/) is a
profile-structured Agent OS stack. The default profile starts the MCP baseline:
`chroma`, `kb-server`, and `mc-server`. The `cloud` profile adds the
cloud-safe `orchestrator`. The compose header also reserves the `ingress` and
`local-model` profile slots for later deployment variants.

| Service / profile | Current baseline | D0 target |
|---|---|---|
| default profile | `chroma`, `kb-server`, and `mc-server`; all three declare per-service `deploy.resources.limits`. `chroma` owns the only Docker healthcheck currently in the stack. | Keep as the baseline MCP stack: Chroma as the unified vector-store primitive, KB/MC as separate request-serving MCP containers, and Sub D-owned MCP readiness proof for the server containers. |
| `cloud` profile | Adds the `orchestrator` service with `NEO_AI_DEPLOYMENT_MODE=cloud`, shared SQLite volume access, and its own resource envelope. | Keep as the Agent OS maintenance control-plane container, running only the cloud-safe scheduler lanes from ADR 0014. |
| `ingress` profile slot | Reserved in the compose header; no service is wired yet. KB and MC are internal-only via `expose`. | Sub C (#11724) adds reverse proxy / TLS termination and public MCP URL wiring. |
| `local-model` profile slot | Reserved in the compose header; no service is wired yet. | Optional self-hosted provider variant. External provider endpoints remain the MVP default. |

The service boundary is intentional: KB and MC serve MCP requests, Chroma stores
vectors, and the orchestrator owns background Agent OS maintenance. Do not
collapse them into a mono-container unless a later ADR explicitly changes the
resource-isolation model.

## Section 2: Scheduler Taxonomy and Cloud Profile

ADR 0014 classifies every orchestrator scheduler lane before the orchestrator is
placed into a cloud container:

| Lane set | Cloud profile behavior |
|---|---|
| `summary`, `backup`, `dream`, `golden-path` | Cloud-deployable maintenance lanes. They need reachable model/provider and storage substrates, but no local maintainer checkout. |
| `bridgeDaemon`, `mlx`, `kbSync`, `primary-dev-sync` | Local-only lanes. They must be disabled in a tenant cloud deployment. |
| `chroma` | Shared primitive. Compose or the platform owns the Chroma process in cloud; the orchestrator does not supervise it. |

Sub A (#11722) delivered the config-level deployment-mode surface. A cloud
orchestrator profile sets `NEO_AI_DEPLOYMENT_MODE=cloud`; the config resolver
then disables local-only lanes unless an operator explicitly opts a narrower
lane back in. The explicit env overrides are:

| Env var | Cloud default intent |
|---|---|
| `NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_ENABLED=false` | Prevents `git fetch` / `git pull`, worktree discovery, `.sync-metadata.json` resets, and local KB-sync cascades. |
| `NEO_ORCHESTRATOR_KB_SYNC_ENABLED=false` | Prevents the local Neo checkout full-corpus `ai:sync-kb` loop. Tenant KB content arrives through push/bulk ingestion instead. |
| `NEO_ORCHESTRATOR_BRIDGE_DAEMON_ENABLED=false` | Prevents desktop wake delivery through `osascript` / `tmux`. A2A message storage remains Memory Core behavior. |
| `NEO_ORCHESTRATOR_GOLDEN_PATH_REPO_ENRICHMENT_ENABLED=false` | Keeps tenant deployments from emitting Neo-maintainer repo backlog/PR enrichment sections. |
| `NEO_ORCHESTRATOR_MLX_ENABLED=false` | Keeps Apple-Silicon local inference out of the cloud profile unless a local-model variant explicitly opts in. |

Sub D (#11725) owns the CI-safe negative proof that the cloud profile cannot run
the forbidden local-only behavior. This cookbook records the contract; it does
not claim that proof has already landed.

## Section 3: Container Packaging

Use per-service containers. Sub B (#11723) delivered the current
profile-structured compose baseline: default MCP stack, `cloud` orchestrator
profile, reserved `ingress` / `local-model` slots, and per-service resource
limits. Sub C (#11724) and Sub D (#11725) still own the remaining
production-profile hardening, so the compose file is closer to the target but
not yet a complete production profile.

Required production-profile properties:

Delivered by Sub B:

- Dedicated containers for `chroma`, `kb-server`, `mc-server`, and cloud-safe
  `orchestrator`.
- Resource envelopes for each declared service.
- Default and `cloud` compose profiles, with reserved `ingress` and
  `local-model` slots.

Still owned by Sub C / Sub D:

- Reverse proxy / TLS ingress and public MCP URL wiring.
- Volumes for backup bundles that survive container rebuilds.
- Healthcheck/readiness semantics for KB, MC, and orchestrator.
- Optional platform variants for Kubernetes, managed Chroma, managed SQL, and
  external model providers without changing the logical service model.

## Section 4: Reverse Proxy and Auth Boundary

The reverse proxy is the public security boundary. It terminates TLS, enforces
OAuth/OIDC or equivalent identity, strips spoofable client identity headers, and
injects the trusted identity headers consumed by the MCP servers.

The current internal compose ports are:

| Service | Internal port |
|---|---|
| `kb-server` | `3000` |
| `mc-server` | `3001` |

Sub C (#11724) owns the production ingress wiring. A path-routed deployment can
publish `/kb/*` and `/mc/*` on one hostname, or the operator can use separate
hostnames. In either shape, set each server's `NEO_PUBLIC_URL` to the canonical
public MCP URL that agents will use.

Header rule: the proxy must remove any incoming `X-PREFERRED-USERNAME` or
`X-AUTH-REQUEST-PREFERRED-USERNAME` header before injecting its own verified
value. With proxy-auth mode enabled, set `NEO_AUTH_TRUST_PROXY_IDENTITY=true`.
For direct OIDC mode, configure the issuer/client values instead of trusting the
proxy header path.

## Section 5: Persistence, Backups, and Provider Profile

The deployment substrates have different recovery properties:

- Chroma data is shared by KB and MC but collection-scoped by substrate.
- KB content is a cache/index over Neo's curated corpus plus tenant-pushed repo
  content. A KB wipe is recoverable by re-sync/re-push, but the operational cost
  scales with tenant count.
- Memory Core graph/session data is a primary store. A wipe between backups is
  data loss.
- Backup bundles need their own durable volume or managed-object-storage target;
  the baseline compose file does not yet provide this.

The orchestrator consumes model-provider endpoints for `summary`, `dream`, and
similar lanes. External provider endpoints are the MVP default. A self-hosted
provider container is a profile variant and should not be coupled to the
orchestrator container.

## Section 6: Environment Variable Inventory

Supply these values per service/profile as needed:

| Variable | Target | Purpose |
|---|---|---|
| `NEO_TRANSPORT=sse` | KB, MC | HTTP/SSE transport for deployed MCP servers. |
| `MCP_HTTP_PORT` | KB, MC | Internal listener port. Current baseline: KB `3000`, MC `3001`. |
| `NEO_PUBLIC_URL` | KB, MC | Canonical public MCP URL used for advertised endpoints and auth callbacks. |
| `NEO_CHROMA_HOST` | KB, MC, Orchestrator | Internal Chroma host, for example `chroma`. |
| `NEO_CHROMA_PORT` | KB, MC, Orchestrator | Chroma port, normally `8000`. |
| `NEO_MEMORY_DB_PATH` | KB, MC, Orchestrator | Shared SQLite graph path or mounted graph-store path. |
| `NEO_AUTH_TRUST_PROXY_IDENTITY=true` | KB, MC | Enables the trusted reverse-proxy identity-header path. |
| `NEO_AUTH_ISSUER_URL`, `NEO_OAUTH_CLIENT_ID`, `NEO_OAUTH_CLIENT_SECRET` | KB, MC | Direct OIDC/OAuth mode inputs when the MCP server handles auth instead of a trusted proxy. |
| `NEO_AI_DEPLOYMENT_MODE=cloud` | Orchestrator | Selects the cloud maintenance profile. |
| `NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_ENABLED=false` | Orchestrator | Disables local maintainer checkout sync. |
| `NEO_ORCHESTRATOR_KB_SYNC_ENABLED=false` | Orchestrator | Disables local full-corpus KB sync. |
| `NEO_ORCHESTRATOR_BRIDGE_DAEMON_ENABLED=false` | Orchestrator | Disables desktop wake delivery. |
| `NEO_ORCHESTRATOR_GOLDEN_PATH_REPO_ENRICHMENT_ENABLED=false` | Orchestrator | Disables Neo-maintainer repo enrichment sections. |
| `NEO_ORCHESTRATOR_MLX_ENABLED=false` | Orchestrator | Keeps local MLX supervision disabled. |
| `NEO_AUTO_SYNC=false` | KB | Prevents one-shot local KB sync during server startup. |
| `NEO_KB_AUTO_START_DATABASE=false` | KB | Prevents the KB server from starting a local Chroma process. |
| `NEO_MEM_AUTO_START_DATABASE=false` | MC | Prevents the MC server from starting a local Chroma process. |
| `NEO_MEM_AUTO_START_INFERENCE=false` | MC | Prevents the MC server from starting local inference. |
| `NEO_AUTO_SUMMARIZE`, `NEO_AUTO_DREAM`, `NEO_AUTO_GOLDEN_PATH`, `NEO_REAL_TIME_MEMORY_PARSING`, `NEO_AUTO_INGEST_FS` | MC | Local/server startup toggles; leave disabled unless the deployment owns those daemon behaviors explicitly. |

The top-level AI config template is [`ai/config.template.mjs`](../../ai/config.template.mjs).
The cloud-ingestion tenant config guide is
[Configuration](cloud-deployment/Configuration.md).

## Section 7: Local-Only Orchestrator Appendix

This section is for Neo maintainer machines only. It is not part of a tenant
cloud deployment.

The local orchestrator can sync multiple local Neo checkouts through the
`primary-dev-sync` lane without committing machine-specific paths. Precedence is:

1. `NEO_ORCHESTRATOR_DEV_SYNC_ROOTS`
2. `ai/config.mjs` `orchestrator.devSyncRoots`
3. unset single owning-checkout behavior

For a durable local setup, create the gitignored `ai/config.mjs` file:

```js
export default {
    orchestrator: {
        devSyncRoots: [
            '/absolute/path/to/neo-gpt/neo',
            '/absolute/path/to/neo-gemini/neo',
            '/absolute/path/to/neo-opus/neo'
        ]
    }
};
```

Then start the existing local orchestrator command:

```sh
npm run ai:orchestrator
```

For one-off process-manager overrides, keep using the env var:

```sh
NEO_ORCHESTRATOR_DEV_SYNC_ROOTS='["/absolute/path/to/neo-gpt/neo","/absolute/path/to/neo-gemini/neo","/absolute/path/to/neo-opus/neo"]' npm run ai:orchestrator
```

Do not add real local clone paths to `package.json` or
`ai/config.template.mjs`; the template default remains
`orchestrator.devSyncRoots: []`.

## Section 8: Healthcheck and Journey Proof

Deployed proof uses MCP tool calls, not a direct HTTP `/healthcheck` route. Call
each server's `healthcheck` tool over its `/mcp` endpoint through the same public
URL and auth path used by real agents.

Operator verification anchors:

- `identity.source === "proxy-header"` confirms the reverse proxy is injecting
  trusted identity headers and the server is reading them.
- `database.topology.mode === "unified"` confirms the shared Chroma topology.
- Provider fields confirm the selected embedding/summary provider profile.
- The Memory Core healthcheck remains the schema authority for MC provider/auth
  details; see [Memory Core](MemoryCore.md).

For the local Dockerized fixture, run `npm run test-integration-unified`. The
integration harness builds `ai/deploy/docker-compose.test.yml`, waits for
Chroma, KB, and MC readiness, then calls the KB and MC `healthcheck` tools over
`/mcp`.
Sub D (#11725) extends the proof to the cloud-safe orchestrator profile and
negative local-only behavior assertions.

## Section 9: Tenant Repo Ingestion Boundary

Tenant KB content enters through the cloud-native ingestion facades, not through
the local `kbSync` scheduler lane. Use the
[Cloud-Native KB Ingestion](cloud-deployment/Overview.md) guide tree for:

- per-tenant identity and visibility rules;
- `ingest_source_files` and bulk CLI hook wiring;
- custom parser/source registration;
- tenant config persistence.

Runnable ingestion examples live in
[`examples/cloud-deployment/`](../../examples/cloud-deployment/). They are
ingestion-contract demonstrations, not production deployment profiles.
The linear first-run operator path is
[Day-0 Cloud Deployment Tutorial](cloud-deployment/Day0Tutorial.md).

## Section 10: Known Gaps and Owner Map

Active #11720 deployment-readiness gaps:

- [#11723](https://github.com/neomjs/neo/issues/11723) - Sub B production
  container topology.
- [#11724](https://github.com/neomjs/neo/issues/11724) - Sub C reference
  compose/profile, ingress, persistence, and provider wiring.
- [#11725](https://github.com/neomjs/neo/issues/11725) - Sub D healthcheck,
  journey proof, and negative cloud-profile assertions.
- [#11728](https://github.com/neomjs/neo/issues/11728) - Sub F2 day-0 tutorial
  plus Docker-capable fresh-run validation.
- [#11730](https://github.com/neomjs/neo/issues/11730) - Post-MVP residual
  architecture once #11720 closes.
- [#11736](https://github.com/neomjs/neo/issues/11736) - Broader deployment
  guide/security hardening outside the F1 MVP cleanup.

Related boundary item closed separately:

- [#11719](https://github.com/neomjs/neo/issues/11719) / PR
  [#11748](https://github.com/neomjs/neo/pull/11748) - Separate narrow
  Markdown table rendering fix for the old Section 6. This rewrite removes the
  old table from the cookbook and intentionally does not use #11719 as a close
  target.

Completed baseline inputs for this cookbook:

- [#11721](https://github.com/neomjs/neo/issues/11721) / PR #11738 - D0 ADR
  0014 topology and scheduler taxonomy.
- [#11722](https://github.com/neomjs/neo/issues/11722) / PR #11739 - top-level
  AI deployment/maintenance config.
- [#11726](https://github.com/neomjs/neo/issues/11726) / PR #11737 - tenant repo
  ingestion operational model.
