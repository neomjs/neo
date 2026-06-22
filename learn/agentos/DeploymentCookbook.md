# Deployment Cookbook: Agent OS Cloud Deployment Authority

This cookbook is the F1 deployment authority delivered by Epic #11720. It
describes the current Agent OS deployment baseline, the D0-decided target
topology, and the post-MVP residual map that remains outside the shipped MVP.

This is not the day-0 tutorial. The executable first-run path lives in
[Day-0 Cloud Deployment Tutorial](cloud-deployment/Day0Tutorial.md). For the
older shared-KB/MC background and threat model, see
[Shared Deployment MVP](SharedDeployment.md). For the cloud topology decision
record, see [ADR 0014](decisions/0014-cloud-deployment-topology-and-scheduler-task-taxonomy.md).

## Section 1: Current Baseline vs Target Topology

The current reference compose file in [`ai/deploy/`](../../ai/deploy/) is a
profile-structured Agent OS stack. The default profile starts the MCP baseline:
`chroma`, `kb-server`, and `mc-server`. The `cloud` profile adds the
cloud-safe `orchestrator`; the `ingress` profile adds the Caddy reverse proxy;
the optional `local-model` profile adds a self-hosted OpenAI-compatible provider
runtime without changing the default external-provider posture.

| Service / profile | Current baseline | D0 target |
|---|---|---|
| default profile | `chroma`, `kb-server`, and `mc-server`; all three declare per-service `deploy.resources.limits` and Docker readiness gates. Chroma uses a TCP probe; KB and MC use an MCP `/mcp` healthcheck tool call. | Keep as the baseline MCP stack: Chroma as the unified vector-store primitive and KB/MC as separate request-serving MCP containers with production readiness semantics. |
| `cloud` profile | Adds the `orchestrator` service with `NEO_AI_DEPLOYMENT_MODE=cloud`, shared SQLite volume access, its own resource envelope, and startup gated on healthy KB/MC services. | Keep as the Agent OS maintenance control-plane container, running only the cloud-safe scheduler lanes from ADR 0014 after the MCP substrate is ready. |
| `ingress` profile | Adds the Caddy reverse proxy for TLS termination and public `/kb/*` / `/mc/*` path routing while KB and MC remain internal-only via `expose`. | Keep as the public boundary for auth/header stripping and MCP URL routing. |
| `local-model` profile | Adds a disabled-by-default `local-model` service using the configurable `NEO_LOCAL_MODEL_IMAGE` image, persistent model volume, healthcheck, and resource envelope. | Optional self-hosted provider variant. Operators must opt KB/MC/orchestrator consumers into `openAiCompatible`; external provider endpoints remain the MVP default. |

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
| `NEO_ORCHESTRATOR_MLX_ENABLED=false` | Keeps Apple-Silicon local inference out of the cloud profile; the `local-model` profile is a separate provider service, not an orchestrator child process. |
| `NEO_MAILBOX_DEFAULT_REPLY_POLICY=blocked` | Keeps cloud A2A message writes tenant-bound through the Memory Core `CAN_REPLY_TO` / reachable-counterparty policy; local wake delivery remains disabled by the orchestrator bridge toggle. |

Sub D (#11725) owns the CI-safe negative proof that the cloud profile cannot run
the forbidden local-only behavior. The current unit substrate already asserts
that cloud-mode default resolution disables `primary-dev-sync`, `kbSync`,
`bridgeDaemon`, and Golden Path repo enrichment unless an operator explicitly
opts a lane back in.

## Section 3: Container Packaging

Use per-service containers. Sub B (#11723) delivered the
profile-structured compose baseline: default MCP stack, `cloud` orchestrator
profile, ingress/local-model profile slots, and per-service resource limits.
Sub C (#11724) added the reference ingress and redeploy-safe backup volume
wiring. Sub D (#11725) delivered KB/MC container readiness semantics and gates
the cloud orchestrator on those MCP server healthchecks. Post-MVP residual
#11734 turns the `local-model` slot into an opt-in service profile while
preserving the external-provider default.

Required production-profile properties:

Delivered by Sub B:

- Dedicated containers for `chroma`, `kb-server`, `mc-server`, and cloud-safe
  `orchestrator`.
- Resource envelopes for each declared service.
- Default, `cloud`, `ingress`, and `local-model` compose profile structure.

Delivered by Sub C / Sub D:

- Reverse proxy / TLS ingress and public MCP URL wiring.
- Volumes for backup bundles that survive container rebuilds.
- Healthcheck/readiness semantics for KB and MC, plus cloud-orchestrator startup
  gating on healthy MCP server containers.

Still owned by follow-up deployment hardening:

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
- Backup bundles persist via a host bind-mount (`./.neo-ai-data/backups` on the
  `cloud`-profile orchestrator) that survives container rebuilds; off-site copy
  or a managed-object-storage target is the disaster-recovery layer above that.

The orchestrator consumes model-provider endpoints for `summary`, `dream`, and
similar lanes. External provider endpoints are the MVP default. A self-hosted
provider container is a profile variant and should not be coupled to the
orchestrator container.

### Optional `local-model` profile

The `local-model` profile starts an internal OpenAI-compatible provider runtime
on `local-model:11434`. It is inactive unless the operator explicitly includes
`--profile local-model`; merely running the default or `cloud` profiles does not
switch KB, MC, or the orchestrator away from external providers.

Use this profile in two phases so model provisioning failures are easy to
separate from Agent OS startup failures:

```sh
NEO_LOCAL_MODEL_KEEP_ALIVE=-1 \
NEO_LOCAL_MODEL_CONTEXT_LENGTH=131072 \
NEO_LOCAL_MODEL_NUM_PARALLEL=1 \
NEO_LOCAL_MODEL_MAX_LOADED_MODELS=2 \
NEO_LOCAL_MODEL_MEMORY_LIMIT=32g \
docker compose -f ai/deploy/docker-compose.yml --profile local-model up -d local-model
docker compose -f ai/deploy/docker-compose.yml --profile local-model exec local-model ollama pull <chat-model>
docker compose -f ai/deploy/docker-compose.yml --profile local-model exec local-model ollama pull <embedding-model>
```

Then start the Agent OS stack with explicit provider env:

```sh
NEO_MODEL_PROVIDER=openAiCompatible \
NEO_EMBEDDING_PROVIDER=openAiCompatible \
NEO_OPENAI_COMPATIBLE_HOST=http://local-model:11434 \
NEO_OPENAI_COMPATIBLE_MODEL=<chat-model> \
NEO_OPENAI_COMPATIBLE_EMBEDDING_MODEL=<embedding-model> \
NEO_OPENAI_COMPATIBLE_KEEP_ALIVE=-1 \
NEO_OPENAI_COMPATIBLE_REQUIRE_PARALLEL_MODELS=2 \
docker compose -f ai/deploy/docker-compose.yml --profile cloud --profile local-model up --build
```

The `requireParallelModels` setting is Neo's observable contract for local
providers: the chat and embedding model must fit resident at the same time. The
orchestrator warns when the configured graph provider only reports one loaded
model or is missing either configured model name. For native Ollama deployments,
set the provider process environment to at least the same count:

```sh
OLLAMA_KEEP_ALIVE=-1 \
OLLAMA_CONTEXT_LENGTH=131072 \
OLLAMA_NUM_PARALLEL=1 \
OLLAMA_MAX_LOADED_MODELS=2 \
ollama serve
```

For OpenAI-compatible providers, use the provider's own loaded-model cap or
pre-load setting (for example LM Studio's loaded-model/JIT setting) and verify
`GET /v1/models` lists both configured model ids before running Sandman.

The expected failure signatures are:

- Missing model: provider calls fail with model-not-found / pull-required errors
  while the `local-model` container healthcheck can still be healthy.
- Provider not started or not on the compose network: KB/MC/orchestrator provider
  calls fail to connect to `local-model:11434`.
- Resource pressure: the `local-model` container restarts or fails its healthcheck;
  tune `NEO_LOCAL_MODEL_NUM_PARALLEL`, `NEO_LOCAL_MODEL_CONTEXT_LENGTH`,
  `NEO_LOCAL_MODEL_MAX_LOADED_MODELS`, `NEO_LOCAL_MODEL_MEMORY_LIMIT`,
  `NEO_LOCAL_MODEL_CPU_LIMIT`, or the chosen model before treating Agent OS
  services as faulty.

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
| `NEO_MAILBOX_DEFAULT_REPLY_POLICY=blocked` | MC | Enables the strict A2A reply policy for multi-tenant deployments. |
| `NEO_AI_DEPLOYMENT_MODE=cloud` | Orchestrator | Selects the cloud maintenance profile. |
| `NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_ENABLED=false` | Orchestrator | Disables local maintainer checkout sync. |
| `NEO_ORCHESTRATOR_KB_SYNC_ENABLED=false` | Orchestrator | Disables local full-corpus KB sync. |
| `NEO_ORCHESTRATOR_BRIDGE_DAEMON_ENABLED=false` | Orchestrator | Disables desktop wake delivery. |
| `NEO_ORCHESTRATOR_GOLDEN_PATH_REPO_ENRICHMENT_ENABLED=false` | Orchestrator | Disables Neo-maintainer repo enrichment sections. |
| `NEO_ORCHESTRATOR_MLX_ENABLED=false` | Orchestrator | Keeps local MLX supervision disabled. |
| `NEO_ORCHESTRATOR_TENANT_REPO_SYNC_ENABLED` | Orchestrator | Master toggle for the `tenant-repo-sync` pull lane. Cloud profile default-on when `tenantRepos[]` is configured; local profile default-off. Set explicitly to override the deployment-profile default. |
| `NEO_ORCHESTRATOR_TENANT_REPO_SYNC_INTERVAL_MS` | Orchestrator | Sweep cadence for the periodic pull lane. Default 1800000 (30 min). |
| `NEO_TENANT_REPO_MIRROR_ROOT` | Orchestrator | Parent directory under which the `GitMirror` primitive stores `tenant-repos/<tenant>/<repo>` mirrors. Per-repo `tenantRepos[].mirrorRoot` overrides this Tier-1 default. Canonical compose value `/app/.neo-ai-data`. |
| `NEO_MODEL_PROVIDER` | MC, Orchestrator | Summary/dream/model-consumer provider selector. **Defaults to `openAiCompatible`** (the local OpenAI-compatible route — configure host/model via the rows below); set `NEO_MODEL_PROVIDER=gemini` for the cloud opt-in (billed remote API). Unset no longer means cloud Gemini. |
| `NEO_EMBEDDING_PROVIDER` | KB, MC | Server-side embedding provider selector. **Defaults to `openAiCompatible`** (the local OpenAI-compatible route); set `NEO_EMBEDDING_PROVIDER=gemini` for cloud embedding generation. |
| `NEO_OPENAI_COMPATIBLE_HOST=http://local-model:11434` | KB, MC, Orchestrator | Internal compose-network URL for the `local-model` service when the optional profile is enabled. |
| `NEO_OPENAI_COMPATIBLE_MODEL`, `NEO_OPENAI_COMPATIBLE_EMBEDDING_MODEL` | KB, MC, Orchestrator | Chat and embedding model names already present in the local-model runtime. |
| `NEO_OPENAI_COMPATIBLE_API_KEY` | KB, MC, Orchestrator | Optional bearer token for OpenAI-compatible providers that require one; normally empty for the local compose service. |
| `NEO_OLLAMA_KEEP_ALIVE`, `NEO_OPENAI_COMPATIBLE_KEEP_ALIVE` | KB, MC, Orchestrator | Provider request keep-alive override. Default `-1` keeps the selected local model resident unless the operator explicitly pins a shorter retention window or `0` unload control. |
| `NEO_OLLAMA_REQUIRE_PARALLEL_MODELS`, `NEO_OPENAI_COMPATIBLE_REQUIRE_PARALLEL_MODELS` | KB, MC, Orchestrator | Local-provider residency expectation for chat + embedding coexistence. Default `2`; the provider-readiness check warns if the selected graph provider cannot observe that count and both configured model names. |
| `NEO_LOCAL_MODEL_IMAGE`, `NEO_LOCAL_MODEL_KEEP_ALIVE`, `NEO_LOCAL_MODEL_CONTEXT_LENGTH`, `NEO_LOCAL_MODEL_NUM_PARALLEL`, `NEO_LOCAL_MODEL_MAX_LOADED_MODELS`, `NEO_LOCAL_MODEL_MEMORY_LIMIT`, `NEO_LOCAL_MODEL_CPU_LIMIT` | `local-model` | Optional image/runtime/resource overrides for the self-hosted provider container. Defaults keep the model resident (`-1`), request 131072 context with one parallel request, allow two loaded models for chat + embedding residency, and reserve a 32g memory envelope unless the operator explicitly tunes down. |
| `NEO_AUTO_SYNC=false` | KB | Prevents one-shot local KB sync during server startup. |
| `NEO_KB_AUTO_START_DATABASE=false` | KB | Prevents the KB server from starting a local Chroma process. |
| `NEO_MEM_AUTO_START_DATABASE=false` | MC | Prevents the MC server from starting a local Chroma process. |
| `NEO_MEM_AUTO_START_INFERENCE=false` | MC | Prevents the MC server from starting local inference. |
| `NEO_AUTO_SUMMARIZE`, `NEO_AUTO_DREAM`, `NEO_AUTO_GOLDEN_PATH`, `NEO_REAL_TIME_MEMORY_PARSING`, `NEO_AUTO_INGEST_FS` | MC | Local/server startup toggles; leave disabled unless the deployment owns those daemon behaviors explicitly. |
| `NEO_MCP_HEALTHCHECK_URL` | Healthcheck CLI | Optional override for `npm run ai:mcp-healthcheck`; compose passes explicit internal URLs instead. |
| `NEO_MCP_HEALTHCHECK_IDENTITY` | Healthcheck CLI | Trusted proxy identity value used by the MCP healthcheck probe when proxy-header auth is enabled. |
| `NEO_MCP_HEALTHCHECK_TOKEN_ENV` / `NEO_MCP_HEALTHCHECK_TOKEN` | Healthcheck CLI | Optional bearer-token slot for direct OIDC/OAuth protected MCP healthchecks. |

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

For a durable local setup, edit the gitignored `ai/config.mjs` file. On a
fresh clone, `npm run prepare` auto-creates `ai/config.mjs` as a copy of
`ai/config.template.mjs`, so it always exists after install — edit the
relevant block (e.g. `orchestrator.devSyncRoots`) and leave the rest at
template defaults:

```js
// In your local ai/config.mjs (gitignored; copy of ai/config.template.mjs):
const defaultConfig = {
    // ... preserved template defaults ...
    orchestrator: {
        // ... preserved fields ...
        devSyncRoots: [
            '/absolute/path/to/neo-gpt/neo',
            '/absolute/path/to/neo-gemini/neo',
            '/absolute/path/to/neo-opus-ada/neo'
        ]
    }
};
```

If the template evolves and your local file falls out of shape-parity, the
`prepare` script warns with the missing imports/exports. Run
`npm run prepare -- --migrate-config` to refresh `ai/config.mjs` from the
template (drops local edits — re-apply them afterward).

Note that `npm install` deliberately does NOT populate the Knowledge Base:
the release artifact carries pre-computed embedding vectors and weighs
hundreds of MB, so fetching it is an explicit opt-in. Run
`npm run ai:download-kb` once (release artifact, no re-embedding) or
`npm run ai:sync-kb` (build the corpus locally) before relying on
`ask_knowledge_base`-class tools — an empty collection answers with exactly
this pointer.

Then start the existing local orchestrator command:

```sh
npm run ai:orchestrator
```

For one-off process-manager overrides, keep using the env var:

```sh
NEO_ORCHESTRATOR_DEV_SYNC_ROOTS='["/absolute/path/to/neo-gpt/neo","/absolute/path/to/neo-gemini/neo","/absolute/path/to/neo-opus-ada/neo"]' npm run ai:orchestrator
```

Do not add real local clone paths to `package.json` or
`ai/config.template.mjs`; the template default remains
`orchestrator.devSyncRoots: []`.

## Section 8: Healthcheck and Journey Proof

Deployed proof uses MCP tool calls, not a direct HTTP `/healthcheck` route. The
production compose file runs `node ./buildScripts/ai/mcpHealthcheck.mjs` inside
the KB and MC containers. That script opens a StreamableHTTP client against the
local `/mcp` endpoint, calls the existing `healthcheck` tool, and exits non-zero
unless the payload reports the expected status. Operators can run the same probe
manually with `npm run ai:mcp-healthcheck`.

The Docker readiness contract is:

- Chroma is ready when its TCP listener is reachable.
- KB is ready when `healthcheck` succeeds over `http://127.0.0.1:3000/mcp`.
- MC is ready when `healthcheck` succeeds over `http://127.0.0.1:3001/mcp`.
- The `cloud` orchestrator profile starts only after Chroma, KB, and MC are
  healthy via compose `condition: service_healthy`.

For public deployed proof, call each server's `healthcheck` tool over its `/mcp`
endpoint through the same public URL and auth path used by real agents.

Operator verification anchors:

- `identity.source === "proxy-header"` confirms the reverse proxy is injecting
  trusted identity headers and the server is reading them.
- `database.connection.connected === true` against the configured `engines.chroma` coordinate confirms the shared Chroma instance is reachable (the topology is permanently `unified` by config — there is no separate runtime topology field).
- Provider fields confirm the selected embedding/summary provider profile.
- The Memory Core healthcheck remains the schema authority for MC provider/auth
  details; see [Memory Core](MemoryCore.md).

For the local Dockerized fixture, run `npm run test-integration-unified`. The
integration harness builds `ai/deploy/docker-compose.test.yml`, waits for
Chroma, KB, and MC readiness, then calls the KB and MC `healthcheck` tools over
`/mcp`.
Sub D (#11725) extended the proof to the cloud-safe orchestrator profile and
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
[`ai/examples/cloud-deployment/`](../../ai/examples/cloud-deployment/). They are
ingestion-contract demonstrations, not production deployment profiles.
The linear first-run operator path is
[Day-0 Cloud Deployment Tutorial](cloud-deployment/Day0Tutorial.md).

### Server-side pull mode (`tenant-repo-sync` lane)

For deployments that prefer the deployment to refresh tenant content autonomously
(instead of waiting on a tenant push hook), the additive pull mode is documented
in [Server-Side Pull Mode](cloud-deployment/TenantIngestionModel.md#server-side-pull-mode-tenant-repo-sync).
The cloud profile MUST add a `tenant-repo-mirrors` named volume mounted at
`<NEO_TENANT_REPO_MIRROR_ROOT>/tenant-repos` (canonical compose: `/app/.neo-ai-data/tenant-repos`)
so the `GitMirror` primitive has a persistent clone target. The env-bound Tier-1 default
`NEO_TENANT_REPO_MIRROR_ROOT=/app/.neo-ai-data` names the **parent** of `tenant-repos/`;
the helper `deriveTenantRepoMirrorPath` appends the `tenant-repos/<tenant>/<repo>` segment. Per-repo `lastIngestedRev`
persistence lives in the orchestrator state dir
(`<NEO_AI_ORCHESTRATOR_DIR>/tenant-repo-sync-revisions.json`), so it survives a
container restart alongside the rest of the orchestrator state. The mirror cache
itself is reproducible from upstream git — backup is optional, not load-bearing.

The `tenant-repo-sync` lane is gated by `NEO_ORCHESTRATOR_TENANT_REPO_SYNC_ENABLED`
(cloud profile default-on; local maintainer profile default-off) and runs on a
30-minute default cadence (`NEO_ORCHESTRATOR_TENANT_REPO_SYNC_INTERVAL_MS`).
Manual sweep: `node ./ai/scripts/maintenance/syncTenantRepos.mjs`.

## Section 10: Delivered MVP and Residual Owner Map

The #11720 deployment-readiness MVP is complete. The items below are retained as
traceability anchors, not active implementation gaps:

- [#11723](https://github.com/neomjs/neo/issues/11723) - Sub B production
  container topology.
- [#11724](https://github.com/neomjs/neo/issues/11724) - Sub C reference
  compose/profile, ingress, persistence, and provider wiring.
- [#11725](https://github.com/neomjs/neo/issues/11725) - Sub D healthcheck,
  journey proof, and negative cloud-profile assertions.
- [#11728](https://github.com/neomjs/neo/issues/11728) - Sub F2 day-0 tutorial
  plus Docker-capable fresh-run validation.

Post-MVP residual work is tracked separately under:

- [#11730](https://github.com/neomjs/neo/issues/11730) - Post-MVP residual
  architecture after the #11720 closeout.
- [#11731](https://github.com/neomjs/neo/issues/11731) - server-side repo-clone
  ingestion exploration, only if push-based tenant ingestion proves
  insufficient.
- [#11732](https://github.com/neomjs/neo/issues/11732) - graph-store evolution
  beyond the SQLite + mounted-volume MVP baseline. Resolved by
  [ADR 0015](decisions/0015-graph-store-backend-posture.md): keep SQLite + WAL
  for now; reopen networked SQL only on graph-specific multi-writer, scale, HA,
  or storage-platform evidence.
- [#11733](https://github.com/neomjs/neo/issues/11733) - downstream external
  deployment-pipeline wiring. Delivered post-MVP — see [Downstream Pipeline
  Wiring](cloud-deployment/PipelineWiring.md).
- [#11734](https://github.com/neomjs/neo/issues/11734) - optional local-model
  runtime container profile.
- [#11735](https://github.com/neomjs/neo/issues/11735) - tenant-source
  inventory deepening beyond the day-0 proof path.
- [#11736](https://github.com/neomjs/neo/issues/11736) - broader deployment
  guide/security hardening outside the F1 MVP cleanup; see
  [Security](cloud-deployment/Security.md) for the first post-MVP hardening
  ledger.

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
