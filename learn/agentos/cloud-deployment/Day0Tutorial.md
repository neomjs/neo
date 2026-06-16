# Day-0 Cloud Deployment Tutorial

> **Status - MVP first-run tutorial for #11728.** This is the linear PoC path for
> an external operator or fresh agent. It proves the adoption ladder without
> requiring private maintainer knowledge. Keep deeper rationale in the
> [Deployment Cookbook](../DeploymentCookbook.md) and the rest of this guide tree.

## Goal

At the end of this tutorial, a fresh operator has:

1. run a Dockerized remote-MCP healthcheck demo;
2. connected to Memory Core and Knowledge Base over StreamableHTTP;
3. queried Neo-shared KB content;
4. pushed one tenant repo payload through the KB repo-push MCP facade and
   reviewed the production repo-push client form;
5. emitted one client-side `parsed-chunk-v1` parser payload;
6. exercised the bulk/backfill path for work over the MCP volume gate;
7. identified the backup/redeploy handoff that must be verified before the
   deployment is treated as durable.

The commands below use local demo endpoints. Replace the URLs, tenant id, repo
slug, and tokens with deployment values once the same path is run behind Caddy
or another production ingress. When a connection behind that ingress does not
work, the [Connection Troubleshooting](./Troubleshooting.md) guide maps each
connect-error (Invalid Host, missing `Accept` header, the auth layers, the
`initialize` handshake) to its fix.

When using the optional ingress profile, `ai/deploy/Caddyfile` binds
`tls internal` to `NEO_DEPLOY_HOSTNAME`, defaulting to `localhost`. Set
`NEO_DEPLOY_HOSTNAME` before starting the ingress service when testing a named
host. If you enable the `gitlab-pat` auth profile and compose reports unhealthy
KB/MC containers or `dependency <svc> failed to start`, see the
[Connection Troubleshooting](./Troubleshooting.md) entry for the required
healthcheck bearer token.

## Prerequisites

Run from a Neo checkout that contains the cloud deployment profile and
repo-push client:

```bash
git clone https://github.com/neomjs/neo.git
cd neo
npm install
```

> **Deploy images source neo independently.** The `ai/deploy` images build by
> cloning neo at a pinned ref (`NEO_REF`, default `dev`), so they do **not** require a
> co-located checkout — any operator or CI host can build them. This local checkout is for
> running the tutorial's commands and for dev iteration (`--build-arg NEO_SOURCE=local`,
> with the neo repo root as the build context). Pin `NEO_REF` to a tag/SHA for a fully
> reproducible deployment.

Required local tools:

| Tool | Check | Expected output |
|---|---|---|
| Node.js 24+ | `node --version` | `v24...` |
| npm | `npm --version` | a version string |
| Docker Compose | `docker compose version` | a Compose version string |

Container runtime choices:

| Runtime | Fit | Setup hint |
|---|---|---|
| Docker Desktop | macOS / Windows desktop default. | Install Docker Desktop and start it before running `docker compose`. |
| Docker Engine | Linux host or server default. | Install the Docker Engine and Compose plugin from your distribution or Docker packages. |
| Colima | Open-source macOS VM runtime with Docker-compatible sockets. | Install `colima` plus Docker CLI tooling, then start a VM before running this tutorial. |
| Podman | Docker-compatible alternative for teams already standardized on Podman. | Enable Docker-compatible Compose support and verify `docker compose version`. |
| OrbStack | macOS desktop runtime with Docker-compatible CLI integration. | Install OrbStack, start it, and verify `docker compose version`. |

All commands in this guide use Docker's canonical no-dash `docker compose`
form. If your runtime only exposes the legacy `docker-compose` binary, wire it
as a Docker CLI plugin before continuing.

For local macOS VM runtimes such as Colima, size the VM for the Agent OS stack:
use roughly 16 GiB as the practical minimum for Chroma + KB + MC +
Orchestrator, and 24+ GiB when loading local chat models alongside the stack.

> **Colima bind-mount gotcha (macOS).** Colima only bind-mounts paths the VM is
> configured to share — your home directory by default. If the deployment (and its
> bind-mounted data dirs) sits **outside** a mounted path, the mounts silently resolve
> to empty VM-local directories: containers start, but your data is not where you expect
> and does not persist on the host — and a `colima restart` does **not** fix it. Keep the
> deployment under a mounted path (somewhere under `$HOME`), or add its parent to Colima's
> mounts (`colima start --mount <path>:w`) before deploying. Verify with
> `colima list`/the mount table that your deploy path is actually shared.

Failure signatures:

| Signature | Meaning | Fix |
|---|---|---|
| `docker: command not found` | Docker is not installed in this environment. | Install Docker Desktop / Docker Engine or run the tutorial on a Docker-capable host. |
| `docker: unknown command: docker compose` | Docker CLI is installed, but the Compose plugin path is not wired. This is common after `brew install docker docker-compose` on macOS. | `mkdir -p ~/.docker/cli-plugins && ln -sf "$(brew --prefix)/bin/docker-compose" ~/.docker/cli-plugins/docker-compose` |
| `Cannot connect to the Docker daemon` | Docker is installed but not running or not accessible. | Start Docker and verify `docker info`. |
| `npm ERR!` during install | Dependencies are missing or the registry is unavailable. | Retry after network recovery; do not continue with a partial `node_modules`. |

## Milestone 0 - Runnable Remote-MCP Healthcheck Demo

Start the day-0 fixture stack. It uses the same Dockerized topology as the
integration harness: Chroma, a deterministic OpenAI-compatible provider mock
that serves embeddings plus chat completions, KB, and MC.

```bash
export NEO_DAY0_PROJECT="neo-day0"

docker compose \
  -p "$NEO_DAY0_PROJECT" \
  -f ai/deploy/docker-compose.test.yml \
  up --build -d chroma embedding-server kb-server mc-server
```

Create a tiny local MCP caller that sends the trusted proxy identity header used
by the fixture:

```bash
cat > /tmp/day0-call-tool.mjs <<'NODE'
import fs from 'node:fs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const [,, baseUrl, identity, toolName, argsFile] = process.argv;
const args = argsFile ? JSON.parse(fs.readFileSync(argsFile, 'utf8')) : {};
const transport = new StreamableHTTPClientTransport(new URL('/mcp', baseUrl), {
  requestInit: {headers: {'X-PREFERRED-USERNAME': identity}}
});
const client = new Client({name: 'day0-tutorial', version: '1.0.0'}, {capabilities: {}});

try {
  await client.connect(transport);
  const result = await client.callTool({name: toolName, arguments: args});
  const text = result.content?.find(item => item.type === 'text')?.text;
  const payload = result.structuredContent || (text ? JSON.parse(text) : result);
  console.log(JSON.stringify(payload, null, 2));
  process.exitCode = result.isError ? 1 : 0;
} finally {
  await client.close().catch(() => {});
}
NODE
```

The fixture publishes these local endpoints:

| Service | URL |
|---|---|
| KB MCP | `http://127.0.0.1:13000/mcp` |
| MC MCP | `http://127.0.0.1:13001/mcp` |
| Chroma heartbeat | `http://127.0.0.1:18080/api/v2/heartbeat` |

Call both healthchecks:

```bash
node /tmp/day0-call-tool.mjs http://127.0.0.1:13000 day0-operator healthcheck
node /tmp/day0-call-tool.mjs http://127.0.0.1:13001 day0-operator healthcheck
```

Expected output from each command includes:

```json
{
  "status": "healthy"
}
```

If Docker is unavailable, the host cannot execute the Docker proof. That is an
environment blocker, not a Neo deployment result.

The healthcheck proves MCP transport, auth stamping, Chroma connectivity, and
provider configuration visibility. It is not by itself a full model-readiness
proof. The integration suite also exercises the same cloud profile through
`test/playwright/integration/CloudProviderReadiness.integration.spec.mjs`, which
calls the deployed Memory Core container against explicit mocked provider
endpoints for:

- OpenAI-compatible `/v1/embeddings`
- streaming OpenAI-compatible `/v1/chat/completions`
- the Dream/REM graph-mutator provider dispatch seam

For production, provider/auth/storage ownership starts at the Tier-1
`ai/config.template.mjs` contract. KB and MC consume that shared provider and
auth shape, while keeping server-local boundaries for ports, collection names,
SQLite paths, and MCP transport details. The two supported cloud-provider
profiles are intentionally distinct:

| Profile | Selectors | Endpoint shape | Use when |
|---|---|---|---|
| Native Ollama | `NEO_MODEL_PROVIDER=ollama`, `NEO_EMBEDDING_PROVIDER=ollama` | Ollama `/api/chat` and `/api/embed` | The deployment exposes a real Ollama service and you want native Ollama request semantics. |
| OpenAI-compatible fallback | `NEO_MODEL_PROVIDER=openAiCompatible`, `NEO_EMBEDDING_PROVIDER=openAiCompatible` | `/v1/chat/completions` and `/v1/embeddings` | The deployment runs MLX, LM Studio, [llama.cpp](./LlamaCppProfile.md), managed OpenAI-compatible infrastructure, or an Ollama endpoint that intentionally exposes the OpenAI-compatible surface. |

Do not mix the selectors accidentally. A native Ollama deployment should prove
the native routes; an OpenAI-compatible deployment should prove both `/v1`
routes. Container health or embeddings-only success is not enough to hand a
cloud deployment to agents. For llama.cpp, run the dedicated
[llama.cpp profile](./LlamaCppProfile.md) before treating the backend as
Agent OS-ready.

For the production profile, the same readiness idea is encoded in
[`ai/deploy/docker-compose.yml`](../../../ai/deploy/docker-compose.yml): Chroma
must be healthy before KB and MC start. The day-0 proof above is the operator
check that the remote KB and MC MCP endpoints themselves answer before the
deployment is handed to agents.

## Milestone 1 - Memory Core Connection

Use the Memory Core endpoint from Milestone 0 or your deployed public URL.

```bash
export NEO_MC_MCP_BASE_URL="http://127.0.0.1:13001"
export NEO_OPERATOR_IDENTITY="day0-operator"
```

Call the `healthcheck` tool using the same identity header your deployment
trusts:

```bash
node /tmp/day0-call-tool.mjs \
  "$NEO_MC_MCP_BASE_URL" \
  "$NEO_OPERATOR_IDENTITY" \
  healthcheck
```

Expected payload fields:

```json
{
  "status": "healthy",
  "database": {
    "connection": {
      "connected": true,
      "engines": { "chroma": true }
    }
  },
  "providers": {
    "auth": {
      "configured": "proxy-header"
    }
  }
}
```

Then write and query one memory from the same identity:

```bash
cat > /tmp/day0-memory.json <<'JSON'
{
  "prompt": "day-0 tutorial smoke",
  "thought": "Memory Core write path reached over remote MCP",
  "response": "memory-core-ok",
  "agent": "day0-operator"
}
JSON

node /tmp/day0-call-tool.mjs \
  "$NEO_MC_MCP_BASE_URL" \
  "$NEO_OPERATOR_IDENTITY" \
  add_memory \
  /tmp/day0-memory.json
```

Expected write result includes a memory id. A follow-up query should return
that memory for the same tenant identity:

```bash
cat > /tmp/day0-memory-query.json <<'JSON'
{
  "query": "day-0 tutorial smoke",
  "nResults": 3
}
JSON

node /tmp/day0-call-tool.mjs \
  "$NEO_MC_MCP_BASE_URL" \
  "$NEO_OPERATOR_IDENTITY" \
  query_raw_memories \
  /tmp/day0-memory-query.json
```

Expected result: at least one returned memory includes `memory-core-ok`.

Failure signatures:

| Signature | Meaning | Fix |
|---|---|---|
| `401 Unauthorized: Missing proxy identity header` | `NEO_AUTH_TRUST_PROXY_IDENTITY=true` but no trusted identity header reached the MCP server. | Verify ingress header stripping/injection and use the same auth path as real agents. |
| `database.connected: false` | MC cannot reach Chroma or SQLite graph storage. | Check `NEO_CHROMA_HOST`, `NEO_CHROMA_PORT`, `NEO_MEMORY_DB_PATH`, and container networking. |

## Milestone 2 - Knowledge Base Connection Over Neo-Shared Content

Use the KB endpoint from Milestone 0 or your deployed public URL.

```bash
export NEO_KB_MCP_BASE_URL="http://127.0.0.1:13000"
export NEO_KB_MCP_URL="http://127.0.0.1:13000/mcp"
```

Call the KB `healthcheck` tool:

```bash
node /tmp/day0-call-tool.mjs \
  "$NEO_KB_MCP_BASE_URL" \
  "$NEO_OPERATOR_IDENTITY" \
  healthcheck
```

Expected payload fields:

```json
{
  "status": "healthy",
  "database": {
    "connection": {
      "connected": true,
      "collections": {
        "knowledgeBase": {
          "exists": true
        }
      }
    }
  },
  "features": {
    "embedding": true
  }
}
```

Seed the Neo-shared corpus once inside the KB container before querying it:

```bash
docker compose \
  -p "$NEO_DAY0_PROJECT" \
  -f ai/deploy/docker-compose.test.yml \
  exec -T kb-server \
  npm run ai:sync-kb
```

For a production compose stack, use the same one-shot form against the deployed
`kb-server`. This is an operator-triggered seed/import, not the periodic cloud
orchestrator `kbSync` lane; `NEO_ORCHESTRATOR_KB_SYNC_ENABLED` remains `false`
per [ADR 0014](../decisions/0014-cloud-deployment-topology-and-scheduler-task-taxonomy.md).

Then query Neo-shared content:

```bash
cat > /tmp/day0-kb-query.json <<'JSON'
{
  "query": "cloud deployment tenant ingestion model",
  "type": "guide",
  "limit": 3
}
JSON

node /tmp/day0-call-tool.mjs \
  "$NEO_KB_MCP_BASE_URL" \
  "$NEO_OPERATOR_IDENTITY" \
  ask_knowledge_base \
  /tmp/day0-kb-query.json
```

Expected result: a synthesized answer with references that include
`learn/agentos/cloud-deployment/TenantIngestionModel.md` or a neighboring
cloud-deployment guide.

Failure signatures:

| Signature | Meaning | Fix |
|---|---|---|
| `collection does not exist` | The KB collection was not initialized. | Run the one-shot `kb-server` `npm run ai:sync-kb` command above, or inspect KB startup logs. |
| Empty answer with healthy DB | The curated Neo content is not indexed. | Verify the image contains the Neo source trees and re-run the one-shot Neo-shared KB sync before tenant onboarding. |
| `Tool not found: ask_knowledge_base` | The endpoint is not the KB MCP server. | Verify `/kb/mcp` routing and `NEO_PUBLIC_URL`. |

## Milestone 3 - Tenant Repo Ingestion

Pick a secret-free tenant tuple:

```bash
export NEO_KB_TENANT_ID="client-org"
export NEO_KB_REPO_SLUG="neomjs/create-app"
export NEO_KB_INGEST_TOKEN="<repo-push-automation-token>"
```

Create a small content-bearing envelope:

```bash
cat > /tmp/day0-envelope.json <<'JSON'
{
  "tenantId": "client-org",
  "repoSlug": "neomjs/create-app",
  "files": [
    {
      "sourcePath": "docs/hello.md",
      "content": "# Hello from the tenant repo\n\nThis chunk proves day-0 tenant ingestion."
    }
  ],
  "deleted": [],
  "baseRevision": "day0-base",
  "headRevision": "day0-head"
}
JSON
```

Submit it to the local fixture through the MCP tool helper. The helper sends
the trusted tenant identity header, so the server can stamp the tenant context:

```bash
node /tmp/day0-call-tool.mjs \
  "$NEO_KB_MCP_BASE_URL" \
  "$NEO_KB_TENANT_ID" \
  ingest_source_files \
  /tmp/day0-envelope.json
```

Production repo-push automation should use the deployable client and token
flow from [Hook Wiring](./HookWiring.md):

```bash
npm run ai:kb-push-client -- \
  --url "https://agent-os.example.com/kb/mcp" \
  --tenant-id "$NEO_KB_TENANT_ID" \
  --repo-slug "$NEO_KB_REPO_SLUG" \
  --from-file /tmp/day0-envelope.json
```

Expected output:

```json
{
  "ingested": 1,
  "errors": []
}
```

Then query the tenant phrase:

```bash
cat > /tmp/day0-tenant-query.json <<'JSON'
{
  "query": "Hello from the tenant repo day-0 tenant ingestion",
  "type": "all",
  "limit": 3
}
JSON

node /tmp/day0-call-tool.mjs \
  "$NEO_KB_MCP_BASE_URL" \
  "$NEO_KB_TENANT_ID" \
  ask_knowledge_base \
  /tmp/day0-tenant-query.json
```

Expected result: the answer or references include `docs/hello.md` and the tenant
content. If the same query is run as a different tenant, private tenant content
must not leak.

Failure signatures:

| Signature | Meaning | Fix |
|---|---|---|
| HTTP `401` / `Unauthorized` | Missing, expired, or wrong-audience repo-push token. | Refresh the automation identity token and verify the audience/resource matches the public KB MCP URL. |
| `KB_INGEST_TENANT_MISMATCH` | Payload tenant claim conflicts with authenticated tenant context. | Fix the token/identity mapping or remove the client-side tenant claim. |
| `KB_INGEST_VOLUME_EXCEEDED` | The payload exceeded `mcpSyncMaxChunks`. | Split the envelope or use Milestone 5's bulk path. |
| `errors` is non-empty | One or more files failed validation or parsing. | Fail the hook/CI job and surface the structured `{code, message}` entries. |

## Milestone 4 - One Client-Side Parser

Client-side parsing is the default for tenant-owned or non-JS formats. Use the
minimal external workspace as the executable shape:

```bash
cd ai/examples/cloud-deployment/minimal-external-workspace
npm install
```

For the worked `.proto` file, emit one `parsed-chunk-v1` record on the client
side and submit it as an ingestion envelope:

```bash
node - <<'NODE' > /tmp/day0-proto-envelope.json
const fs = require('fs');
const content = fs.readFileSync('proto/example.proto', 'utf8');

process.stdout.write(JSON.stringify({
  tenantId: 'client-org',
  repoSlug: 'neomjs/create-app',
  files: [{
    sourcePath: 'proto/example.proto',
    parsedChunks: [{
      schemaVersion: '1.0.0',
      tenantId: 'client-org',
      repoSlug: 'neomjs/create-app',
      rootKind: 'external-source',
      sourcePath: 'proto/example.proto',
      content,
      hashInputs: ['kind', 'name', 'content', 'sourcePath', 'parserId', 'parserVersion'],
      parserId: 'proto-client-day0',
      parserVersion: '1.0.0',
      kind: 'schema',
      name: 'example.proto'
    }]
  }]
}));
NODE

cd ../../..
node /tmp/day0-call-tool.mjs \
  "$NEO_KB_MCP_BASE_URL" \
  "$NEO_KB_TENANT_ID" \
  ingest_source_files \
  /tmp/day0-proto-envelope.json
```

Expected output:

```json
{
  "ingested": 1,
  "errors": []
}
```

Failure signatures:

| Signature | Meaning | Fix |
|---|---|---|
| `KB_PARSED_CHUNK_INVALID` | The record violates `parsed-chunk-v1`. | Validate against [`parsed-chunk-v1.schema.json`](../../../ai/services/knowledge-base/parser/parsed-chunk-v1.schema.json); remove unknown top-level fields. |
| `KB_PARSED_CHUNK_EMBEDDING_REJECTED` | The client sent an `embedding` field. | Remove embeddings; the KB server owns embedding generation. |
| Parser output accepted but query misses it | Tenant identity, visibility, or repo slug does not match the query context. | Query as the same authenticated tenant and verify `repoSlug`. |

## Milestone 5 - Bulk / Volume-Gate Path

The MCP path is for bounded push deltas. To prove the operator response to the
volume gate, first know the failure:

```json
{
  "code": "KB_INGEST_VOLUME_EXCEEDED",
  "batchSize": 312,
  "threshold": 50
}
```

The response is either split into smaller repo-push envelopes or run a
deployment-host bulk import. In the local fixture, run the bulk CLI inside the
KB container so it uses the same container-local embedding and Chroma endpoints:

```bash
node - <<'NODE' > /tmp/day0-bulk.jsonl
for (let i = 0; i < 3; i++) {
  process.stdout.write(JSON.stringify({
    schemaVersion: '1.0.0',
    tenantId: 'client-org',
    repoSlug: 'neomjs/create-app',
    rootKind: 'external-source',
    sourcePath: `bulk/doc-${i}.md`,
    content: `# Bulk doc ${i}\n\nBulk import smoke record ${i}.`,
    hashInputs: ['kind', 'name', 'content', 'sourcePath', 'parserId', 'parserVersion'],
    parserId: 'bulk-day0',
    parserVersion: '1.0.0',
    kind: 'doc-section',
    name: `Bulk doc ${i}`
  }) + '\n');
}
NODE

cat /tmp/day0-bulk.jsonl | docker compose \
  -p "$NEO_DAY0_PROJECT" \
  -f ai/deploy/docker-compose.test.yml \
  exec -T kb-server \
  node ./buildScripts/ai/ingestTenant.mjs client-org --from-stdin --batch-size 2
```

Expected output:

```json
{
  "tenantId": "client-org",
  "ingested": 3,
  "errors": []
}
```

Failure signatures:

| Signature | Meaning | Fix |
|---|---|---|
| `Deferred: heavy-maintenance lease held by ...` | Another heavy KB job is active. | Retry after the holder completes. |
| `KB_INGEST_CLI_JSONL_PARSE_FAILED` | A JSONL line is malformed. | Fix the line; the CLI reports parse errors without hiding sibling records. |
| Non-zero CLI exit | One or more records failed. | Inspect the printed `errors` array before retrying. |

## Milestone 6 - Optional Pull Mode / Server-Side Tenant Repo Sync

Push (Milestone 3) is the primary tenant-ingestion path — tenant repo workflow drives the publish cadence under a service-account identity, and the deployment never holds tenant-repo credentials. Pull mode is the **additive alternative** for tenants who want the deployment to own the ingestion cadence (orchestrator polls the tenant repo on a schedule rather than waiting on a `pre-push` hook).

The substrate that powers pull mode shipped via Epic [#11731](https://github.com/neomjs/neo/issues/11731) — clone-trust + credential-boundary contract (`TenantRepoAccessContract` + `GitMirror`), envelope builder, scheduler lane, `RawRepoSource`, `branchRef`, `file:` credentialRef, Tier-1 `tenantRepoMirrorRoot` fallback. Read [Tenant Ingestion Model](./TenantIngestionModel.md) for the operator decision model and [Hook Wiring](./HookWiring.md) for the push-vs-pull selection guide.

**Skip this milestone if push covers your tenant content.** Pull is additive, not a prerequisite for the Day-0 operator handoff.

If pull mode applies to your deployment, configure one tenant repo as a smoke. The pull-mode polling config resolves through the same three tiers as the rest of tenant config: the `kb-config:<tenantId>` graph node → the `kb-config.yaml` bootstrap (`tenants.<id>.tenantRepos`) → the local `config.mjs` `aiConfig.tenantRepos[]` default. `kb-config.yaml` is the canonical bootstrap tier; the `config.mjs` overlay below remains the Tier-3 default fallback.

```js
// In <NEO_SOURCE_DIR>/ai/mcp/server/knowledge-base/config.mjs (operator overlay — Tier-3 default):
tenantRepos: [
    {
        tenantId      : 'client-org',
        repoSlug      : 'client-org/example-repo',
        cloneUrl      : 'https://git.example.com/client-org/example-repo.git',  // clean URL; no userinfo@
        credentialRef : 'env:NEO_TENANT_EXAMPLE_TOKEN',                          // reference-only; resolved at GIT_ASKPASS time
        branchRef     : 'main'                                                   // optional; defaults to 'HEAD' = remote default
    }
]
```

Set the credential at the deployment env (compose, k8s Secret, or `file:/run/secrets/<name>` per [#12046](https://github.com/neomjs/neo/pull/12046)):

```bash
export NEO_TENANT_EXAMPLE_TOKEN="<read-only-repo-access-token>"
```

Trigger the first sync:

```bash
node ai/scripts/maintenance/syncTenantRepos.mjs --repo-slug client-org/example-repo
```

Expected output:

```json
{
  "status": "completed",
  "details": {
    "repoCount": 1,
    "completedCount": 1,
    "repos": [{"tenantId": "client-org", "repoSlug": "client-org/example-repo", "status": "active", "lastIngestedRev": "<sha>"}]
  }
}
```

Verify the chunks landed:

```bash
node /tmp/day0-call-tool.mjs \
  "$NEO_KB_MCP_BASE_URL" \
  "client-org" \
  ask_knowledge_base \
  /tmp/day0-tenant-query.json   # re-use the query envelope from Milestone 3
```

Failure signatures:

| Signature | Meaning | Fix |
|---|---|---|
| `KB_GITMIRROR_CLONE_FAILED` | Clone subprocess failed (network, auth, missing repo, or — Day-0 — missing `git` binary in older deploy images per [#12036](https://github.com/neomjs/neo/issues/12036)). | Verify `read_repository` scope on the token; verify deploy image is built from current `ai/deploy/Dockerfile` (post-#12037 ships `git`). |
| `KB_TENANT_REPO_CREDENTIAL_REF_REQUIRED` / `KB_GITMIRROR_CREDENTIAL_REF_INVALID` | `credentialRef` missing or doesn't resolve at runtime. | Confirm the env var name matches the `credentialRef` exactly; for `file:` scheme, confirm the file exists + is non-empty. |
| `KB_TENANT_REPO_MIRROR_ROOT_REQUIRED` | No per-repo `mirrorRoot`, no Tier-1 default, no env var. | Set `NEO_TENANT_REPO_MIRROR_ROOT=/app/.neo-ai-data` in compose env (the canonical default, env-bound to `aiConfig.orchestrator.tenantRepoMirrorRoot` per [#12050](https://github.com/neomjs/neo/pull/12050)). |

### Operator-owned Custom Source (genuinely orthogonal)

A separate operator pattern: the deployment owns the source territory entirely — running its own full-corpus build over a repo it has on disk, *not* polling a tenant repo through `tenantRepos[]`. That's a [Custom Source](./CustomSources.md) workflow (`Source.extract` + `SourceRegistry`), distinct from pull mode. Both can coexist in a single deployment (pull-mode for tenant-owned repos + Custom-Source for operator-owned content territories).

Expected day-0 result for this milestone is one of:

```text
pull mode configured for <tenantId>/<repoSlug>; first sync completed at <sha>
```

or:

```text
skipped — push (Milestone 3) covers our tenant content
```

or:

```text
operator-owned Custom Source registered intentionally
```

## Milestone 7 - Backup, Redeploy, Handoff

Before handing the deployment to agents, prove the Memory Core store survives a
container rebuild and that KB content can be regenerated or re-pushed.

Minimum handoff checklist:

```text
[ ] shared-sqlite-data volume or managed graph-store path is persistent.
[ ] backup bundles write to the redeploy-safe backup mount.
[ ] after docker compose down && docker compose up --build, MC healthcheck is healthy.
[ ] the memory written in Milestone 1 can still be queried.
[ ] KB Neo-shared content is either still present or re-synced successfully.
[ ] tenant content is either still present or re-pushed by the hook/CI job.
[ ] endpoint URLs, token source, tenant id, repo slug, and known failure signatures are documented for the next agent.
```

Production compose persistence is documented in the
[Deployment Cookbook](../DeploymentCookbook.md). Do not treat a demo stack that
uses tmpfs or disposable test volumes as durable evidence.

## Final Operator Handoff

Record this small state bundle before the first real agent session uses the
deployment:

```text
MC URL:
KB URL:
Auth mode: proxy-header | OIDC
Tenant id:
Repo slug:
Repo-push token source:
Last successful MC healthcheck:
Last successful KB healthcheck:
Last successful tenant push:
Backup location:
Known skipped milestones:
```

If any milestone is skipped, name the blocker explicitly. A future agent should
never have to infer whether the deployment is incomplete, unauthenticated demo
only, or intentionally deferred.

## Related

- [Connection Troubleshooting](./Troubleshooting.md) - the connect-error ladder + deployment gotchas (Caddyfile rebuild, network-internal ports, the two auth layers) for when a connection does not work.
- [Deployment Cookbook](../DeploymentCookbook.md) - deployment authority and service topology.
- [Overview](./Overview.md) - cloud ingestion concepts and tenant/Neo-shared split.
- [llama.cpp Profile](./LlamaCppProfile.md) - OpenAI-compatible llama.cpp provider profile and dual-residency smoke.
- [Tenant Ingestion Model](./TenantIngestionModel.md) - repo identity, parser dispatch, and source-family inventory.
- [Hook Wiring](./HookWiring.md) - `ai:kb-push-client`, `ingest_source_files`, and `ai:ingest-tenant`.
- [Custom Parsers](./CustomParsers.md) - client-side `parsed-chunk-v1` parser contract.
- [Security](./Security.md) - tenant stamping, spoof rejection, and parser trust.
