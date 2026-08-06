# Cloud Deployment Troubleshooting

A first real deployment of the Agent OS behind a reverse proxy crosses several layers — the MCP SDK's Host validation, the proxy's `Accept` / auth handling, the identity-header contract, and the MCP handshake itself. Each layer fails with its *own* error, and the fix differs per layer. This guide is the **connect-error ladder**: each error → which layer you just cleared → the fix.

> Complements the [Day-0 Tutorial](Day0Tutorial.md) (the happy path) and [Client Authentication](ClientAuthentication.md) (the PAT login). Reach for this when a connection does not work.

## The connect-error ladder

Work top-to-bottom — each error means you cleared the layer above it.

### `-32000 Invalid Host: <your-host>`

**Layer:** the MCP SDK's DNS-rebinding protection, which defaults to a **localhost-only** Host allowlist. Behind a reverse proxy the public `Host` header reaches the server unchanged and is rejected before any MCP handling — for *every* client, not just browsers.

**Fix (either):**
- Configure the server's Host allowlist to include your public hostname: set `NEO_PUBLIC_URL=https://mcp.<your-host>` (its hostname is auto-allowed) and/or `NEO_MCP_ALLOWED_HOSTS=<comma-separated hostnames>`. (localhost stays allowed — the container healthcheck needs it.)
- Or rewrite the upstream Host to localhost at the proxy (Caddy: `header_up Host localhost` on the `reverse_proxy` block). This is the no-rebuild interim fix; the allowlist config is the durable one.

### `Not Acceptable: Client must accept text/event-stream`

**Layer:** you reached the Streamable HTTP MCP endpoint, not a web page; the client omitted the required `Accept` header.

**Fix:** send `Accept: application/json, text/event-stream` on every request.

### `HTTP 302 → /oauth2/sign_in`

**Layer:** a reverse-proxy auth gate (e.g. oauth2-proxy) sits in front of the MCP server; your request has no valid session, so it redirects to sign-in.

**Fix:** authenticate past the proxy. For the durable headless path see [Client Authentication](ClientAuthentication.md) (GitLab-PAT Bearer); for first bring-up you can open the test path (see *Test vs production profile*).

### `-32000 Unauthorized: Missing proxy identity header`

**Layer:** you cleared the proxy, and the server is in `trustProxyIdentity` mode — it expects the proxy to inject a validated identity header (e.g. `X-PREFERRED-USERNAME`) and strips any *client-supplied* identity header (anti-spoof). No injected identity → rejected.

**Fix:** have the proxy inject the identity header for authenticated requests (oauth2-proxy forwards the upstream identity; Caddy via `forward_auth` + `header_up`). For a no-auth test path, set `NEO_AUTH_TRUST_PROXY_IDENTITY=false` *and* inject a static identity at the proxy, or run the open test profile.

### `-32000 Bad Request: Server not initialized`

**Layer:** you are authenticated and talking to the MCP server — but called a tool (e.g. `tools/list`) before the MCP **`initialize` handshake**.

**Fix:** do the handshake first — `initialize` → capture the `Mcp-Session-Id` response header → `notifications/initialized` → then tool calls (carrying the session id). See *Verify from outside* below.

### A body of `event: message` / `data: {…}`

**Not an error.** That is normal SSE response framing within Streamable HTTP — a successful `initialize` returns `event: message` plus a `data:` line carrying the JSON-RPC result (including `serverInfo`).

## Deployment gotchas

### The Caddyfile is baked into the image

A Caddyfile (or any config copied in at image-build time) is **not** picked up by a container restart. After editing it, rebuild:

```bash
NEO_DEPLOY_PROJECT_NAME=<project> docker compose up -d --build caddy
```

A plain `restart` re-runs the *old* baked config.

### Container ports are network-internal

In a typical compose deployment only the ingress (Caddy) publishes a host port; the MCP servers listen on the internal compose network. A host-side `curl http://127.0.0.1:<port>` therefore finds nothing — expected, not a failure. Test from *inside* the network instead:

```bash
NEO_DEPLOY_PROJECT_NAME=<project> docker compose exec <server> node ./ai/scripts/diagnostics/mcpHealthcheck.mjs --url http://127.0.0.1:<port>
```

…or go through the ingress on the public URL.

### Two auth layers — do not fight the wrong one

A proxied deployment commonly has **two** auth layers, and an error at one is easily mistaken for the other:

1. **The reverse-proxy gate** (e.g. oauth2-proxy cookie / OAuth) — decides whether a request reaches the MCP server at all (error: `302 → sign_in`).
2. **The MCP server's identity** (`trustProxyIdentity` header *or* a Bearer token) — decides *who* the authenticated request is (errors: `Missing proxy identity header`, `401`).

Identify which layer an error came from (via the ladder) before changing any config.

### `dependency <svc> failed to start` after enabling `NEO_AUTH_MODE=gitlab-pat`

**Symptom:** after switching a compose deployment to `NEO_AUTH_MODE=gitlab-pat`,
`docker compose up` leaves `kb-server` or `mc-server` unhealthy, and dependent
services report `dependency <svc> failed to start`.

**Confirm it is the bearer healthcheck case, not a boot crash:** send a
tokenless `initialize` request through the public ingress. A clean `401` with
`WWW-Authenticate: Bearer` means the MCP server is up and enforcing auth; a
`502`, timeout, or connection-refused result points at a process/proxy boot
failure instead.

**Cause:** the in-container healthcheck runs `mcpHealthcheck.mjs` against the
same authenticated `/mcp` route. In `gitlab-pat` mode that self-probe must also
send a bearer token. If `NEO_MCP_HEALTHCHECK_TOKEN` is unset or empty, the
healthcheck gets `401`, the container never reaches `service_healthy`, and
compose dependency waits abort.

**Fix:** set `NEO_MCP_HEALTHCHECK_TOKEN=<read_user bearer>` in the deployment
`.env` (a GitLab PAT or OAuth access token with the same `read_user` validation
surface as other MCP clients), then recreate the affected services so the
environment is reloaded:

```bash
NEO_DEPLOY_PROJECT_NAME=<project> docker compose up -d --force-recreate kb-server mc-server orchestrator
```

This is an environment-only repair; no image rebuild is required.

### `inspect_deployment` says `No Docker container found for compose service ...`

**Layer:** the MCP server is reachable and the deployment-state bridge snapshot
is fresh, but the orchestrator's runtime-access holder cannot resolve one or
more allowlisted Compose services through Docker labels.

Read `snapshot.bridgeDiagnostics` before changing service code:

- `runtimeAccess.enabled: false` means the bridge is intentionally not using a
  runtime handle. Set `NEO_ORCHESTRATOR_RUNTIME_ACCESS_ENABLED=true` only when
  B1 runtime diagnostics/recovery are intended.
- `reason: broad-service-lookup-failure` means most or all configured services
  failed at the observation layer. Treat this as bridge configuration first,
  not as four independent service outages.
- `compose-project-unavailable` means runtime access was enabled without a
  project identity. For the canonical stack, set
  `NEO_DEPLOY_PROJECT_NAME=<project>` and recreate the orchestrator; the Compose
  file binds that one value to both Docker project labels and the runtime holder.
- `compose-service-no-match` means Docker returned no container for the label
  filter shown in the error details. Verify both
  `com.docker.compose.project=<project>` and
  `com.docker.compose.service=<service>`. Align
  `NEO_ORCHESTRATOR_RUNTIME_ACCESS_ALLOWED_SERVICES` and
  `NEO_DEPLOYMENT_STATE_BRIDGE_ALLOWED_SERVICES` with Docker
  service labels, not container names, and do not pass a standalone `-p` that
  conflicts with `NEO_DEPLOY_PROJECT_NAME`.
- `compose-service-ambiguous` means more than one container matched a service
  label inside the configured project. Resolve the duplicate/scaled target;
  project binding must not be weakened to select one arbitrarily.
- `compose-project-mismatch` or `compose-service-mismatch` means a Docker
  response did not prove the exact requested label pair. The holder rejects the
  target before inspect, logs, stats, or restart and does not expose the foreign
  label value.
- `docker-socket-unavailable` or `docker-socket-forbidden` means the
  orchestrator cannot read the runtime socket. Mount `/var/run/docker.sock`
  into the orchestrator with suitable permissions, or disable runtime access
  explicitly when that deployment should not expose B1 diagnostics.
- The default diagnostic set observes sibling services, not the orchestrator
  container itself. When orchestrator logs/state are needed for a cloud
  incident, add the Compose service label to both
  `NEO_ORCHESTRATOR_RUNTIME_ACCESS_ALLOWED_SERVICES` and
  `NEO_DEPLOYMENT_STATE_BRIDGE_ALLOWED_SERVICES` (for the bundled compose file,
  use `orchestrator`).

The diagnostic intentionally exposes only non-secret config, service keys, and
the label filter shape. It does not enumerate arbitrary containers or expose
Docker, shell, restart, or daemon-control routes through public MCP tools.

## Test profile vs production auth profile

Verify the wiring *before* real auth is enabled, but keep the two profiles distinct:

- **Test / bring-up profile:** open the Caddy path (no oauth2-proxy gate) and either `NEO_AUTH_TRUST_PROXY_IDENTITY=false` or a static identity injected at the proxy. Proves ingress + handshake without per-user auth. **Not for production.**
- **Production profile:** proxy gate on + a real per-user credential — `trustProxyIdentity` with an injected identity, or `NEO_AUTH_MODE=gitlab-pat` Bearer (see [Client Authentication](ClientAuthentication.md)).

## Verify from outside (the handshake)

Confirm a deployment end-to-end with `curl` — no MCP client needed. MCP `initialize` is a short sequence:

```bash
URL="https://mcp.<your-host>/mc/mcp"
AUTH=(-H "Authorization: Bearer ${NEO_MCP_TOKEN}")   # or your proxy's auth, per profile

# 1. initialize → expect HTTP 200 + an `mcp-session-id` response header + serverInfo
curl -sS -i -X POST "$URL" "${AUTH[@]}" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'

# 2. read the Mcp-Session-Id header from step 1, then:
SID="<mcp-session-id from step 1>"

# 3. notifications/initialized (carry the session id)
curl -sS -X POST "$URL" "${AUTH[@]}" \
  -H "Accept: application/json, text/event-stream" -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: ${SID}" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}'

# 4. tool calls now work, e.g. tools/list
curl -sS -X POST "$URL" "${AUTH[@]}" \
  -H "Accept: application/json, text/event-stream" -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: ${SID}" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

A healthy Streamable HTTP server can return `event: message` SSE framing carrying the JSON-RPC results. A `Server not initialized` error means step 1's handshake was skipped.

> There is no auth-free `GET /health` liveness endpoint today — the server exposes only the authenticated `/mcp` route — so external liveness checks run the `initialize` handshake above (or rely on the container's internal healthcheck).

## First query returns nothing — the empty-KB gap

A freshly deployed Knowledge Base can be **healthy but empty**: `healthcheck` reports `count: 0` and queries return nothing until an ingest writes chunks. Treat that as an ingestion-state question, not a Chroma readiness question.

For push-mode deployments, trigger the deployment's ingestion entry point once, then query again.

For a pull-mode deployment, read `tenantRepoSync.config.bootstrap` before treating an empty repo
count as intentional:

| Bootstrap status | Meaning | Operator action |
|---|---|---|
| `missing` | The optional `kb-config.yaml` file is not mounted. | Confirm graph/AiConfig is the intended authority, or mount the bootstrap file. This state does not degrade diagnostics. |
| `empty` | The file was readable but contained no YAML document. | Add the intended `tenants:` mapping, or keep the file empty when another tier is authoritative. This state does not degrade diagnostics. |
| `loaded` | The file matched the `{tenants: {...}}` contract. | Compare `tenantCount`, effective `repoCount`, and `tierCounts` to the intended deployment. A zero tenant count is valid. |
| `read-failed` | The file exists or was addressed, but the service could not read it. | Fix mount visibility, ownership, or permissions, then refresh the deployment snapshot. |
| `parse-failed` | The file was readable but was not valid YAML. | Validate and correct YAML syntax, redeploy the file, then refresh the snapshot. |
| `invalid-shape` | YAML parsed, but the top level was not an object containing an object-valued `tenants` mapping. | Restore the documented `tenants:` bootstrap shape, then refresh the snapshot. |

The three failure states degrade the config diagnostic without discarding safely resolved graph or
AiConfig fallback repos. The snapshot deliberately omits paths, YAML content, tenant/repository
identities, clone URLs, credentials, tokens, stacks, and raw filesystem/parser messages.

For pull-mode deployments with configured `tenantRepos[]`, call `inspect_deployment` or `get_deployment_state_snapshot` and inspect the `tenantRepoSync` section before taking manual action. It distinguishes disabled, true no-configured-repos, not-due, running, completed, failed, and degraded/unreadable state without exposing credentials or raw logs. A degraded config-read error means the graph/YAML/default config resolver could not prove the effective `tenantRepos`; treat that differently from a real empty config. If the task is configured but has not advanced, use the stable reason code and per-repo hashed state there to decide whether to wait for the next due sweep, fix credentials/config, or run `node ./ai/scripts/maintenance/syncTenantRepos.mjs --repo-slug <slug>` inside the orchestrator container. When `lastErrorCode` is `KB_TENANT_REPO_SYNC_SYNC_FAILED`, check `lastSourceErrorCode`: `KB_GITMIRROR_CREDENTIAL_REF_INVALID`, `KB_GITMIRROR_CLONE_FAILED`, or `KB_GITMIRROR_FETCH_FAILED` points to the credential/ref/upstream access path before generic ingestion debugging. `KB_VECTOR_EMBED_FAILED` means the repository fetch and envelope reached the ingestion layer but vector writes failed; correct the embedding path before retrying. `KB_INGEST_STORE_UNREACHABLE` is the transport sibling of that code: ingestion started but could not reach the vector store at all, so treat it as store availability (restarting, saturated, wrong host/port) rather than as an embedding-path defect — retrying is appropriate once the store answers, whereas `KB_VECTOR_EMBED_FAILED` will keep failing until the embedding path itself is corrected. A bare `KB_INGEST_FAILED` now means only that the thrown error carried no bounded code; the underlying message is deliberately not projected, so escalate on the surrounding lane state rather than expecting the code to narrow further.

`credentialRef: none` is genuinely anonymous: GitMirror does not consult the
orchestrator account's Git config, URL rewrites, helpers, `.netrc`, SSH config,
agent, or default keys. Configure `env:`, `file:`, or `ssh:` explicitly when the
remote is private. SSH endpoints should carry their non-secret login name (for
example `ssh://git@host/org/repo.git`); the key remains in `credentialRef`.
GitMirror preserves TOFU continuity in
`<mirrorRoot>/.gitmirror-ssh/known_hosts`, not in the host user's home.

Read `tenantRepoSync.accessReadiness` before waiting for cadence. `ready` means every enabled
repo passed the process-local credential check and bounded remote capability probe; `degraded`
means at least one proved failure; `unknown` means the current process has not produced valid
evidence yet (commonly immediately after restart); `not-required` means there are no enabled
required repos. Inspection reads cached evidence and never triggers network work.

| Access code | Meaning | Operator action |
|---|---|---|
| `KB_TENANT_REPO_ACCESS_CREDENTIAL_INVALID` | The env secret, secret file, or SSH key is missing, empty, unreadable, or its reference shape is invalid. | Align the configured reference with the orchestrator's mounted env/file/key, then let the next sweep re-resolve it. |
| `KB_TENANT_REPO_ACCESS_TIMEOUT` | The bounded `ls-remote` probe exceeded its deadline. | Check upstream latency, firewall/proxy behavior, and DNS; do not infer token scope from a timeout. |
| `KB_TENANT_REPO_ACCESS_TRANSPORT_FAILED` | Git reported a network/DNS/connection-class failure. | Restore egress and name resolution from the orchestrator network. |
| `KB_TENANT_REPO_ACCESS_DENIED_OR_NOT_FOUND` | The remote did not grant readable repository capability, or intentionally hid a missing repository behind the same response. | Verify repository membership/reach and read permission for this specific repo; do not assume one token reaches sibling groups/namespaces. |
| `KB_TENANT_REPO_ACCESS_REF_NOT_FOUND` | The repo was readable but the configured ref was not advertised. | Correct `branchRef` or publish the intended branch/tag. |
| `KB_TENANT_REPO_ACCESS_REF_UNVERIFIED` | A raw commit SHA was not an advertised ref tip, so `ls-remote` could prove repo access but not commit reachability. | Let the normal clone/fetch resolve the SHA; do not rewrite the ref solely from this unknown result. |
| `KB_TENANT_REPO_ACCESS_EVIDENCE_EXPIRED` | The cached proof is older than its bounded lifetime. | Wait for the next sync sweep to re-probe; inspection does not launch network work. |
| `KB_TENANT_REPO_ACCESS_PROBE_FAILED` / `KB_TENANT_REPO_ACCESS_PROBE_UNAVAILABLE` | The probe could not produce a certifying category. | Verify the orchestrator and GitMirror code are from one current image cohort, then inspect service health. |
| `KB_TENANT_REPO_ACCESS_SYNC_FAILED` | A later authoritative clone/fetch failed after or without the cached probe. | Use `lastSourceErrorCode` and the normal GitMirror acquisition runbook; clone/fetch supersedes older probe evidence. |

Current releases accept a tenant-repo ingest as successful only when the returned summary contains
an array-valued, empty `errors` field. Under checkpoint contract v2, a manifest-bearing bootstrap,
non-linear fallback, manual full replay, or legacy revalidation must also persist an attempt-bound
graph receipt for a positive safe-integer `ingested` or `deleted` count. The one zero-effect
exception is checkpoint recovery: when the matching receipt is still unacknowledged because the
prior local checkpoint write failed or crashed, the next run settles it before repeating KB
mutation. An acknowledged receipt cannot be reused by a later manual full replay. The receipt is
pull-internal; `ingest_source_files` cannot submit or receive it. Otherwise
`KB_TENANT_REPO_SYNC_EMPTY_MATERIALIZATION` preserves the last known-good revision. Incremental
no-op remains valid, as does a full reconciliation whose only effect is deletion. A failed attempt
keeps the last known-good revision. If the
deployment was upgraded after an older release had already advanced its checkpoint on an
error-bearing or zero-effect v1 summary, the stored head has no current success proof. The periodic lane classifies
that repo as `checkpointStatus: pending` and performs one bounded null-base replay automatically.
Only `concurrencyLimit` legacy checkpoints are admitted per one-minute scheduler sweep; failures
become `checkpointStatus: failed`, preserve the old head, and retry through normal backoff.

Inspect `tenantRepoSync.checkpointRevalidation` for pending, failed, complete, uninitialized, and
unsupported counts. The aggregate is unavailable when repository enumeration, revision-state
reading, or persisted-marker validation fails, because an all-zero projection cannot prove an empty checkpoint set.
Per-repo rows use hashed identities and expose the same `checkpointStatus` without clone URLs,
refs, credentials, or raw errors. A future/unsupported contract marker requires upgrading this
runtime. A present but malformed marker is invalid persisted state. Both fail closed and are never
silently downgraded; malformed state makes the aggregate unavailable rather than fabricating a
per-repo classification.

After correcting the underlying failure, ordinary periodic retry is sufficient. To accelerate one
known repo rather than wait for its cadence/backoff, use the scoped operator override:

```text
node ./ai/scripts/maintenance/syncTenantRepos.mjs --full --repo-slug <slug>
```

`--full` is rejected without an explicit repo selector. It does not delete the stored checkpoint:
a failed or fresh zero-effect replay preserves it, while an error-free replay with a positive
ingest/delete effect advances it to the current head and writes the current success-contract
marker. A zero-effect retry can advance only when it settles the matching unacknowledged receipt
from an interrupted post-ingest checkpoint commit before repeating Knowledge Base mutation.

The CLI and the daemon's periodic sweep serialize through a cross-process lease next to the
revisions manifest. Exit code `4` (reason `KB_TENANT_REPO_SYNC_LEASE_HELD`) means another sync is
active — retry after it finishes; a periodic sweep deferred the same way reports a `skipped`
outcome with that reason and no backoff mutation. Crashed lease owners recover automatically on
the next attempt (pid-liveness). A live sweep renews its lease every `max(5s, TTL/3)`, so
`leaseStaleAfterMs` only ever expires an owner that stopped renewing (fully wedged or gone); a run
that loses its lease anyway fails with `KB_TENANT_REPO_SYNC_LEASE_LOST` at its next work fence —
before further git, ingest, or manifest work — leaving checkpoints, backoff state, and the new
owner's lease untouched, so the failure is safe to retry once the concurrent run finishes. Lease
transitions themselves (recovery, release, renewal) serialize through a sibling
`…lease.json.lifecycle-guard` directory; an abandoned guard from a hard crash self-heals after
~10 seconds and needs no operator action.

Manifest writes are atomic (temp sibling + fsync + rename), so upgrades from this release forward
cannot produce a torn `tenant-repo-sync-revisions.json`. Should a manifest from an older release
(or exotic filesystem damage) fail the strict read anyway, deleting the file is the safe last
resort: it costs one full re-ingestion pass, because every head then classifies `uninitialized`
and replays from a null base under the normal bounded admission — never hand-edit it instead.

If the deployment snapshot is fresh but the tool returns `status: degraded` with
`reason: snapshot-section-missing` or `snapshot-producer-metadata-missing`, fix
the bridge producer before debugging repo credentials or embeddings. Those
reasons mean the public KB/MC server can read the snapshot file, but the
orchestrator bridge that wrote it is older than the current diagnostic contract
or omitted a required top-level section such as `tenantRepoSync`. Recreate the
orchestrator with the current image/config, then re-run the public tool and only
continue pull-mode ingestion debugging once `schemaDiagnostics.status` is
`available`.

## See also

- [Day-0 Tutorial](Day0Tutorial.md) — the first-deployment happy path.
- [Client Authentication](ClientAuthentication.md) — the GitLab-PAT login.
- [Configuration](Configuration.md) · [Security](Security.md)
