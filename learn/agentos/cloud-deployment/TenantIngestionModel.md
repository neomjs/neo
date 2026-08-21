# Cloud-Native KB Ingestion — Tenant Ingestion Model

> **Status — MVP operational model.** This guide documents Sub E of Epic [#11720](https://github.com/neomjs/neo/issues/11720): how an external tenant gets its repository content into a cloud-deployed Knowledge Base without tacit Neo maintainer knowledge. The substrate it names was delivered by Epic [#11624](https://github.com/neomjs/neo/issues/11624); this guide defines the operator-facing model on top.

## Decision Summary

For the MVP deployment path, tenant ingestion is **push-based**:

1. The tenant workspace reads its own repository content.
2. The tenant sends raw file deltas or `parsed-chunk-v1` records to the deployment.
3. The KB server validates the payload, stamps the authoritative tenant tuple, embeds the chunk text server-side, and writes into the shared `knowledge-base` collection.

The deployment does **not** need clone credentials for the MVP path. Server-side repo cloning is the additive tenant-repo-sync path owned by [#11731](https://github.com/neomjs/neo/issues/11731) after the push MVP; it does not repoint the existing ingestion API or weaken the no-secret persistence boundary.

This model pairs with the D0 scheduler taxonomy in [#11721](https://github.com/neomjs/neo/issues/11721): local maintainer checkout sync stays local-only, while cloud tenant content arrives through the push-based path below.

## Entry Points

Use the same underlying ingestion service through three operational surfaces:

| Surface | Use when | Volume / lifecycle |
|---|---|---|
| `ingest_source_files` | A tenant agent or push client sends a bounded incremental change set to the cloud MCP endpoint running with `transport === 'streamable-http'`. | MCP-callable only in the remote Streamable HTTP profile and volume-gated by `mcpSyncMaxChunks`; split or use the CLI when the gate refuses. |
| `npm run ai:kb-push-client` | A tenant git hook or CI job needs an operator-facing invocation wrapper for the remote MCP call. | Runs in the tenant workspace, uses the configured remote MCP client transport, carries an automation identity bearer token, and preserves the MCP gate. |
| `npm run ai:ingest-tenant -- <tenantId> ...` | A deployment operator, CI job, or onboarding script performs an initial import, full backfill, or large re-push. | Runs on the deployment host, bypasses the MCP turn-volume gate via `viaMcp: false`, and holds the heavy-maintenance lease. |

All three surfaces call `KnowledgeBaseIngestionService.ingestSourceFiles()`. The MCP facade is hidden and fail-closed for local `stdio` server sessions because repo-push ingestion is an operator-facing remote deployment path, not an interactive local agent tool. A future non-MCP HTTP/queue receiver may share the same service, but it is not the shipped #11743 path.

## Repository Identity

Every pushed `parsed-chunk-v1` record belongs to this path-identity tuple:

| Field | Operational rule |
|---|---|
| `tenantId` | Server-derived from the authenticated caller. A payload may carry a tenant claim, but it is not authoritative. |
| `repoSlug` | Tenant-owned repository identifier. It is namespaced by `tenantId`, must be deterministic, and must never contain credentials. |
| `rootKind` | Required repository topology hint: `neo-workspace`, `bare-repo`, or `external-source`. It selects hydration assumptions for content under the same `repoSlug`. |
| `sourcePath` | Forward-slash-normalized path relative to the `repoSlug` root. It is never resolved against the KB server's `neoRootDir`. |

`branch` is still useful operational metadata for the source branch or ref that
produced a push, but it is part of the deployment runbook and tutorial evidence,
not part of the current `parsed-chunk-v1` required schema.

Recommended `repoSlug` shape:

```text
<provider-or-org>/<repo-name>
```

Examples:

```text
neomjs/create-app
neomjs/neo
internal/platform
```

If a tenant has multiple repos, each repo gets its own stable `repoSlug`. Manifests, tombstones, reconciliation, retention, alerting, telemetry, and source-family inventory remain scoped per `{tenantId, repoSlug}`. A bulk import that mixes repos must still let each record or batch resolve the correct `repoSlug`.

Do not derive `repoSlug` from a credential-bearing remote URL. Normalize it from an explicit non-secret name chosen by the tenant or deployment operator.

## Credential Boundary

The push-based MVP path is credential-free from the KB server's perspective:

- The tenant workspace already has access to its own repository.
- The tenant push client reads local files and sends content or parsed chunks.
- The KB server receives ingestion payloads, not Git credentials.
- The repo-push automation identity token authorizes the tenant to call the KB MCP endpoint; it is not a Git credential and is never folded into `repoSlug`, manifests, or chunk metadata.
- Optional server-side pull config uses `tenantRepos[]` entries with clean `cloneUrl`, reference-only `credentialRef`, and normalized `repoSlug` (#11787). Credential-bearing HTTP userinfo is rejected before graph persistence; a non-secret SSH login name (`ssh://git@host/...` or `git@host:path`) remains endpoint metadata, while key injection belongs to the `GitMirror` primitive (#11788). `GitMirror` resolves the credential reference only for the git subprocess invocation (`GIT_ASKPASS` for HTTPS, `GIT_SSH_COMMAND` for SSH) and keeps mirror contents on the deployment `tenant-repo-mirrors` volume mounted at `NEO_TENANT_REPO_MIRROR_ROOT`.
- `credentialRef: none` means anonymous access, never “inherit the orchestrator account.” Every pull-path Git subprocess ignores system/global Git config, URL rewrites, credential helpers, `.netrc`, user SSH config, agents, and default identities; the selected `env`, `file`, or `ssh` authority is added back explicitly. SSH host-key continuity is kept separately in the GitMirror-owned mirror-volume ledger rather than in the host user's home.
- For the pull-based follow-up path, `TenantRepoIngestEnvelopeBuilder` adapts the Git mirror into the same ingestion service envelope (#11789). Linear history advances emit raw-file `files`, explicit `deleted` tombstones, `baseRevision`, and `headRevision`; bootstrap, missing-baseline, and non-linear history cases emit a full `files` snapshot plus `manifestSnapshot` so `KnowledgeBaseIngestionService.ingestSourceFiles()` can reconcile the claimed live file set without re-pointing the local `kbSync` lane.
- Pull-mode **file selection** comes from the git mirror itself (`git ls-tree` / revision diff in `TenantRepoIngestEnvelopeBuilder`) and is independent of `kb-config.yaml`'s Source/Parser registration. In particular, `sourcePaths.RawRepoSource.root` is **not** honored on the pull path — the whole tracked tree is ingested. `rawRepoSource` / `sourcePaths` drive the full-corpus Source build (`kbSync` lane / `npm run ai:sync-kb`), a different path from pull mode.

Credential-bearing Git URLs are therefore rejected or treated as deferred clone-exploration input. They must not appear in:

- `repoSlug`
- logs
- manifests
- tutorial snippets
- graph-visible configuration
- source-family inventory output

If a future server-side clone path becomes necessary, [#11731](https://github.com/neomjs/neo/issues/11731) owns the credential transport and storage contract before implementation begins.

## Repo-Push Automation Identity

For day-0 tenant push, create an automation identity accepted by the deployment's
MCP auth mode and scope it to the tenant repository source it represents. The
tenant hook or CI job stores the resulting bearer in its secret store and
exposes it as `NEO_KB_INGEST_TOKEN`.

For OIDC server mode, the deployment's OAuth audience/resource must match the
KB MCP public resource. Behind the reference ingress, the KB MCP URL is
typically:

```text
https://agent-os.example.com/kb/mcp
```

In the default OIDC server mode, the token's resource should match the canonical
KB public URL configured by `NEO_PUBLIC_URL` / the auth provider. In
`NEO_AUTH_MODE=gitlab-pat`, the bearer is a GitLab OAuth access token or
Personal Access Token with `read_user`; the server validates it against
GitLab's `/api/v4/user` and derives the tenant identity from the returned
username. The exact token acquisition flow is operator-owned — client
credentials, workload identity, GitLab OAuth, or a rotated PAT are all valid —
but the resulting bearer must be tenant-scoped, stored outside the repository,
and rotated according to the deployment's auth policy.

The server remains authoritative for tenant identity. `NEO_KB_TENANT_ID` is a client default for envelope construction; authenticated context still stamps or rejects tenant metadata according to deployment policy.

## Parser Dispatch

The parser decision is per source family, not per tenant:

| Source family | Default dispatch |
|---|---|
| Neo-supported text/source formats | Raw file delta to `ingest_source_files`; server-side parser or `raw-text` fallback. |
| Custom but trusted operator-installed formats | Raw file delta with a registered `parserId`; server-side parser execution is operator-gated. |
| Custom, untrusted, non-JS, or tenant-owned parser logic | Client-side parser emits `parsed-chunk-v1`; the KB server validates and embeds only the parsed records. |
| Unknown format | Record as `unsupported` or `client-parser-required`; do not silently skip. |

The KB server owns embeddings. `parsed-chunk-v1` records carrying an `embedding` field are rejected; pre-embedded records belong to restore-only backup paths, not ingestion.

## Source-Family Inventory

Before onboarding a tenant repository, produce a source-family inventory. The inventory is the handoff from Sub E into the day-0 tutorial work in [#11728](https://github.com/neomjs/neo/issues/11728).

Use this checklist:

| Source family | Questions to answer |
|---|---|
| Runtime source | Which languages and module systems are present? Which can use Neo-shipped parsers, and which require client-side parser output? |
| Tests | Which unit, integration, e2e, fixture, and test-helper trees should be indexed? Which test artifacts should be excluded? |
| Docs | Which Markdown, ADR, API, OpenAPI, generated-doc, and runbook files are authoritative? |
| Config and deployment | Which package, Docker, CI, env-template, and infrastructure files should be indexed? Which carry secrets or local-only values and must be excluded or redacted? |
| IDE/header/test-library equivalents | Which project-specific metadata files are needed for agents to understand conventions? |
| Generated artifacts | Which files are generated and should be excluded unless they are the source of truth? |
| Custom formats | Which formats need client-side parser output? Who owns parser versioning and deprecation? |

Each inventory row should choose one dispatch outcome:

```text
server-raw
server-parser:<parserId>
client-parsed:<parserId>
unsupported
excluded
```

## Deletion and Manifest Policy

Incremental pushes should include deletion intent. Prefer this default shape:

- `deleted` tombstones for explicit deletes.
- `baseRevision` + `headRevision` when the push client can provide a reliable SHA range.
- `manifestSnapshot` when the push point is meant to advance the claimed live file set for a repo.

`manifestSnapshot.repoSlug` must match the repo whose `pathsAfterPush` it describes. A missing manifest does not authorize deleting earlier rows; it only means that push did not advance the claimed-state baseline. A bulk initial import can skip manifest state, but the deployment should follow it with a manifest-carrying push or an explicit claimed-state resync before relying on reconciliation to delete orphans.

## Operational Flow

1. Pick a stable `tenantId`, one or more secret-free `repoSlug` values, and the `rootKind` for each ingested source root.
2. Build the source-family inventory.
3. Choose dispatch for each family: raw server parse, registered server parser, client-side `parsed-chunk-v1`, unsupported, or excluded.
4. Run initial import with `ai:ingest-tenant` when volume exceeds the MCP gate.
5. Create the repo-push automation identity, configure the OIDC audience or GitLab bearer policy, and store the token as `NEO_KB_INGEST_TOKEN` in the tenant hook or CI secret store.
6. Wire incremental `pre-push` or CI pushes through `ai:kb-push-client` to the remote MCP endpoint.
7. Include tombstones and revision boundaries; include manifests at reconciliation points.
8. Fail the hook or CI job on structured ingestion errors instead of silently dropping files.
9. Verify retrieval against the tenant corpus plus `neo-shared` content before handing the deployment to agents.

## Server-Side Pull Mode (Tenant Repo Sync)

Push-based ingestion (above) remains the MVP path. Server-side pull is the **additive** complement for deployments where the tenant workspace can't run a push hook, or where the operator wants the deployment to refresh on its own cadence.

The pull lane (`tenant-repo-sync`) clones each configured repository into a deployment-owned mirror, fetches periodically, builds the same ingestion envelope the push path uses, and writes through `KnowledgeBaseIngestionService.ingestSourceFiles({...envelope, viaMcp: false})`. **Push and pull share one ingestion contract** — the only difference is who initiates the cycle. Mixing both for the same `repoSlug` is supported but operationally noisy; pick one per repo unless reconciling.

### When to use pull vs push

| Choose pull when | Choose push when |
|---|---|
| The tenant can't run a `pre-push` hook or CI job pointed at the deployment | The tenant workspace already has its repo content and an outbound network path |
| The deployment must refresh autonomously on cadence | A push-based pre-commit hook is the natural delivery surface |
| Operators want a single named `tenantRepos[]` config they manage centrally | Tenant teams own their own push surface |
| The repo is upstream-open (`https://github.com/<org>/<repo>` style) and the deployment can clone it | Repo lives in an isolated network that the deployment can't reach |

### Configuration

The orchestrator's pull-mode sync (`TenantRepoSyncService.resolveTenantReposConfig`) resolves `tenantRepos` via `KnowledgeBaseIngestionService.listConfiguredTenantRepos()`. That resolver enumerates each configured tenant's *effective* config across three tiers — `kb-config:<tenantId>` graph node > `kb-config.yaml` bootstrap > `aiConfig.tenantRepos[]` default — single-winner per tenant (a tenant's highest present tier wins wholesale; tiers are not merged within a tenant), then flattens `tenantRepos` across tenants. Graph-only tenant config nodes are discovered through the graph service's RLS-aware tenant-config enumeration surface, not through an unrestricted raw graph scan. Each entry is normalized through the `TenantRepoAccessContract`. Each entry:

```js
{
    tenantId      : 'neomjs',                           // server-derived; must match the authenticated tenant for stamping
    repoSlug      : 'neomjs/create-app',                // tenant-owned, namespaced, never credential-bearing
    cloneUrl      : 'https://github.com/neomjs/create-app.git',  // clean URL; SSH may carry a non-secret login name
    credentialRef : 'file:/run/secrets/neomjs_repo_token', // env:VAR and ssh:/path remain supported
    branchRef     : 'dev',                              // optional; git ref (branch/tag/sha) to ingest from. Default: 'HEAD' = remote default branch
    rootKind      : 'external-source',                  // 'neo-workspace' | 'bare-repo' | 'external-source'
    parserId      : 'raw-text',                         // optional; defaults to family dispatch
    parserVersion : '1'                                 // optional
}
```

**Credential-bearing `cloneUrl` strings (`https://user:token@...`) are rejected at config normalization.** A clean SSH login name is not credential material and may remain in the endpoint (`ssh://git@host/org/repo.git` or `git@host:org/repo.git`); this keeps the remote user deterministic after ambient SSH config is removed. The `credentialRef` is a reference that uses one shared grammar: `none`, `env:NAME`, `file:/path`, or `ssh:/path` (a legacy bare environment-variable name remains accepted). The same normalized grammar feeds `GitMirror`; unknown schemes such as `helper:*` fail during effective-config resolution rather than becoming delayed environment lookups. `none` is deliberately anonymous. `GitMirror` resolves explicit credential material only at its local validation or isolated git-subprocess boundary (`GIT_ASKPASS` for HTTPS, `GIT_SSH_COMMAND` for SSH). The deployment graph never persists resolved credentials.

Use `file:/run/secrets/<name>` when the deployment mounts Git credentials through Docker `secrets:` or a Kubernetes Secret volume. `GitMirror` reads and trims the file at resolution time, then feeds the value through the same transient `GIT_ASKPASS` path as `env:` credentials; empty, missing, or unreadable files fail before git runs. `ssh:` references likewise require a present, readable, non-empty key before Git constructs `GIT_SSH_COMMAND`.

At the first orchestrator sync sweep, before per-repo cadence/jitter can defer clone/fetch,
`TenantRepoSyncService` performs a bounded, read-only capability preflight for every enabled
effective repo. It resolves credential material locally, then runs `git ls-remote --exit-code`
against the clean URL and configured ref through GitMirror's existing askpass/SSH/redaction
boundary. The process caches only a keyed credential fingerprint plus bounded status/code/time;
config or credential rotation invalidates that entry. A normal clone/fetch remains authoritative
and can supersede stale probe evidence. One failed preflight does not block unrelated repositories
or suppress the normal retry path.

**`branchRef` (optional)** selects which git ref to ingest from. Omitted = `'HEAD'` = the remote's default branch. Useful when the canonical product-source-of-truth branch differs from the repo's default branch — e.g., trunk-based teams using `dev` as integration line + `main` as release-tag-only. Validated as a non-empty string at config normalization; accepts any git ref name (branch, tag, sha) since it flows through `gitMirror.resolveHead()`.

For the canonical config schema and rejection rules, see [`TenantRepoAccessContract.mjs`](../../../ai/services/knowledge-base/helpers/TenantRepoAccessContract.mjs).

### Triggers

The pull lane has two trigger surfaces — periodic and manual — and they share the same `TenantRepoSyncService.runTask()` entry point.

**Periodic (Orchestrator lane):**

The `tenant-repo-sync` lane is registered with the Agent OS Orchestrator. The Orchestrator's `poll()` calls `tenantRepoSyncGetDueTask({state, now, intervalMs, enabled})`; when due, it dispatches `TenantRepoSyncService.runTask({taskName, reason, taskStateService, healthService, writeLog})`.

Toggles:

| Env var | AiConfig path | Default | Effect |
|---|---|---|---|
| `NEO_ORCHESTRATOR_TENANT_REPO_SYNC_ENABLED` | `orchestrator.cloudOnly.tenantRepoSyncEnabled` | cloud profile: enabled; local: disabled | Master toggle for the periodic lane |
| `NEO_ORCHESTRATOR_TENANT_REPO_SYNC_INTERVAL_MS` | `orchestrator.intervals.tenantRepoSyncMs` | 30 minutes | Base per-repo ingestion cadence before deterministic jitter and failure backoff |
| `NEO_ORCHESTRATOR_TENANT_REPO_SYNC_SWEEP_CADENCE_MS` | `orchestrator.tenantRepoSync.sweepCadenceMs` | 1 minute | Scheduler scan cadence for admitting repos whose individual cadence is due |
| `NEO_ORCHESTRATOR_TENANT_REPO_SYNC_LEASE_STALE_AFTER_MS` | `orchestrator.tenantRepoSync.leaseStaleAfterMs` | 6 hours | TTL backstop on the cross-process sync lease for a fully wedged owner. A live sweep renews its lease every `max(5s, TTL/3)` so it never expires mid-work; crashed owners recover instantly via pid-liveness, and ownership is re-verified at work fences (per-repo git phase, KB ingest, manifest commit), so an evicted writer aborts instead of overlapping |

The `cloudOnly` collection is the inverse-polarity sibling of `localOnly`. `null` means "use the deployment-profile default" (cloud enables, local disables); explicit `true`/`false` overrides. Local Neo-maintainer deployments default-off because most operator checkouts don't have `tenantRepos[]` configured.

**Manual (operator CLI):**

For bootstrap, one-off after a config change, or scoped re-sync, use the standalone CLI:

```text
node ./ai/scripts/maintenance/syncTenantRepos.mjs                   # all configured tenantRepos
node ./ai/scripts/maintenance/syncTenantRepos.mjs --repo-slug a/b   # subset
node ./ai/scripts/maintenance/syncTenantRepos.mjs --repo-slug a/b --repo-slug c/d
node ./ai/scripts/maintenance/syncTenantRepos.mjs --full --repo-slug a/b  # scoped full replay
```

`--full` requires at least one explicit, repeatable `--repo-slug` selector. It builds the selected
repo envelopes from a null revision base while retaining each stored checkpoint until the replay
returns an error-free ingestion summary. Current releases automatically revalidate unversioned
checkpoints through the periodic lane; use `--full` only to accelerate or explicitly repeat one
selected repo after correcting its underlying failure. Do not delete the revisions file.

Exit code: `0` on `completed`; `1` on another non-completed task outcome (`yielded`, `deferred`, `starved`, `failed`, or `skipped`); `2` on argument error; `3` when a requested repo slug is not configured; and `4` when either the deployment-wide heavy-maintenance lease or the narrower tenant-repo-sync lease is held. `yielded` is healthy but intentionally incomplete: the active cohort's resumable state was committed, the outer lease was returned so another heavy task can interleave, and rerunning resumes the remaining repos. A global deferral writes `Deferred: heavy-maintenance lease held by <owner>` to stderr; a same-lane deferral returns `KB_TENANT_REPO_SYNC_LEASE_HELD`, so the diagnostic — not the shared exit code — identifies the holder class. Global holders such as Dream/REM or backup can legitimately be long-lived (up to the configured heavy-maintenance stale bound; six hours by default), so wait for the named task rather than retrying on the shorter tenant-sync cadence. The CLI uses an in-memory `TaskStateService` stand-in so it works without an orchestrator-daemon state-dir; both leases, not task state, provide cross-process serialization — a held lease is a bounded busy exit, never a silent race.

### Mirror Volume

`GitMirror` clones each `<tenantId>/<repoSlug>` under a deployment-owned root:

| Env var | Default | Mount in compose |
|---|---|---|
| `NEO_TENANT_REPO_MIRROR_ROOT` | `/app/.neo-ai-data` (env-bound to Tier-1 `aiConfig.orchestrator.tenantRepoMirrorRoot`) | named volume `tenant-repo-mirrors` at `<root>/tenant-repos` (canonical: `/app/.neo-ai-data/tenant-repos`) |

The env var names the **parent** of `tenant-repos/`; `deriveTenantRepoMirrorPath` appends the `tenant-repos/<tenant>/<repo>` segment so the same root can host other gitignored substrate-data subdirs. Per-repo `tenantRepos[].mirrorRoot` overrides this Tier-1 default when present.

The repository mirrors are deployment caches, not authoritative corpus state. The same durable volume also carries `.gitmirror-ssh/known_hosts`, GitMirror's isolated SSH host-key ledger; probe, clone, and fetch share it so `accept-new` remains TOFU rather than accepting a new key on every process. Per-repo `lastIngestedRev` is stored separately in `<orchestrator-data-dir>/tenant-repo-sync-revisions.json` (sibling to the orchestrator state file) so the next sync can compute the incremental diff.

Two invariants protect that manifest. First, every sync — the daemon's periodic
sweep and the manual CLI alike — must acquire the dedicated cross-process lease
(`tenant-repo-sync-lease.json`, a sibling of the manifest so lock and data share
one persistence boundary) before reading or writing it; exactly one writer can
exist at a time, so a manual replay can never erase a periodic update or vice
versa. A held lease defers the periodic sweep with the non-failure reason
`KB_TENANT_REPO_SYNC_LEASE_HELD` and touches no repo's checkpoint, attempt
timestamp, or backoff state. Second, manifest writes are atomic — a temporary
sibling file is written, fsynced, and renamed over the target — so a crash
mid-write leaves the previous complete document readable instead of a truncated
JSON the strict reader would fail-close on.

The lease's exclusivity itself rests on three cooperating mechanisms. Every
read-verify-mutate transition on an existing lease record — stale recovery,
release, renewal — is serialized through a short-lived lifecycle guard
(`tenant-repo-sync-lease.json.lifecycle-guard`), so a transition only ever acts
on state it re-observed inside the guard; plain acquisition stays an atomic
exclusive create. A running sweep renews its own lease every
`max(5s, TTL/3)`, so a live owner never reaches its deadline and cannot be
reclaimed mid-work; crashed owners recover immediately via pid-liveness and a
fully wedged owner via the `leaseStaleAfterMs` TTL backstop. And ownership is
re-verified at work fences — before each repo's git phase, before each
Knowledge Base ingest, and before every manifest commit — so a run whose
renewal failed (or whose lease was reclaimed) aborts with
`KB_TENANT_REPO_SYNC_LEASE_LOST` before starting further protected work, leaves
every repo's checkpoint and backoff state untouched, and never commits a
partial sweep.

Each checkpoint also carries `ingestContractVersion`, written together with the
head only after the Knowledge Base returns an explicit error-free summary. The
current v2 contract makes every manifest-bearing full materialization
(bootstrap, non-linear fallback, manual full replay, or legacy revalidation)
write an attempt-bound positive-effect receipt into the tenant manifest graph
before the local checkpoint acknowledges that attempt id. A fresh full attempt
must report a positive safe-integer `ingested` or `deleted` effect. The check
runs after ingestion so an empty manifest can still delete stale rows; a
delete-only full reconciliation is valid.

If the Knowledge Base effect and graph receipt succeeded but the later local
checkpoint write crashed, the next run settles the matching unacknowledged
receipt before re-running Knowledge Base mutation. Its bookkeeping result is
therefore `ingested=0, deleted=0`. Once a checkpoint acknowledges the attempt
id, that receipt is stale and cannot excuse a later manual full replay at the
same head. The receipt field is pull-internal: the public `ingest_source_files`
facade strips caller-supplied attempts and never returns graph receipts. A
current incremental envelope may legitimately report `ingested=0, deleted=0`.
`lastAttemptedIngestContractVersion` records a failed revalidation attempt
without advancing the head. A head without the current v2 success marker has
unknown historical validity and is never used as an incremental base; v1
checkpoints therefore receive the same bounded null-base revalidation as older
unversioned records.

After an upgrade, the periodic lane automatically replays such legacy
checkpoints from a null base. It admits at most `concurrencyLimit` legacy
replays per scheduler sweep, ordered by the oldest prior attempt, while normal
repos retain their cadence and the semaphore still bounds simultaneous work.
A failed replay preserves the old head and participates in the existing
exponential backoff. A clean replay co-writes the new head and current proof
markers in one repo record, after which normal incremental sync resumes.

### Redeploy Posture

Mirrors are reproducible from upstream git. **Backup is not required** for correctness — on redeploy, `GitMirror.cloneIfMissing()` re-clones any missing mirror on the next sync. Operators who want faster cold-start recovery may include the `tenant-repo-mirrors` volume in their backup bundle, but this is an operational preference, not a Chroma/MC correctness dependency.

`lastIngestedRev` persistence in `tenant-repo-sync-revisions.json` IS load-bearing for incremental ingestion. The canonical cloud profile keeps that file on the dedicated `orchestrator-state` named volume, so it survives orchestrator-container recreation under a stable Compose project name. That volume is **not** an off-host backup; include it in an explicit backup/export policy before claiming host-loss recovery.

### Health and Telemetry

Per-repo freshness is surfaced through the existing Memory Core healthcheck orchestrator task block. After each `runTask` cycle, `HealthService.recordTaskOutcome('tenant-repo-sync', ..., details)` projects this shape:

```js
{
    reason                       : 'periodic-sweep:60000' | 'manual' | 'no-tenant-repos-configured',
    repoCount                    : 3,
    completedCount               : 1,
    deferredCount                : 0,
    partialProgressCount         : 1,
    failedCount                  : 0,
    revalidationDeferredCount    : 0,
    leaseYielded                 : true,
    leaseDeferredCount           : 1,
    repos: [
        {
            tenantId             : 'neomjs',
            repoSlug             : 'neomjs/create-app',
            lastIngestedRev      : 'a1b2c3d4',    // short SHA from the most recent successful ingest
            lastSyncAt           : '2026-05-25T05:30:00.000Z',
            status               : 'active',      // also partial-progress, lease-yield-deferred, degraded, or another bounded lane state
            checkpointStatus     : 'complete',    // 'pending' | 'failed' | 'complete' | 'uninitialized' | 'unsupported'
            lastSyncDeletedCount : 0,
            corpusOutstanding    : {
                state          : 'outstanding',   // 'complete' | 'outstanding' | 'unobservable'
                observable     : true,
                settled        : 250,             // cumulative accepted work already settled
                remaining      : 618,             // authoritative provider work left
                outstanding    : 618,             // compatibility alias; always === remaining
                lastDecreasedAt: 1787300000000,
                observedAt     : 1787300300000
            },
            lastErrorCode        : null,          // present only when status !== 'active'
            lastSourceErrorCode  : null           // optional bounded source code, e.g. KB_GITMIRROR_FETCH_FAILED
        }
    ]
}
```

The operator readiness endpoint reads this shape from `HealthService` — there is no need to read Chroma rows for freshness checks. `leaseYielded: true` means the outer hold bound was observed. When a clean cohort leaves work behind, each suppressed row is reported as `lease-yield-deferred`, `leaseDeferredCount` carries the total, and the task outcome is `yielded`. An ordinary failure or deferral retains its stronger `failed` / `deferred` status; if the final active repo had already exhausted the corpus and no tail remained, the outcome stays `completed`. `partialProgressCount` remains distinct because a slice-caused rotation continues the same sweep and does not return the outer lease. Empty `tenantRepos[]` produces `repos: []`, not an omission.

`corpusOutstanding` is cumulative across resumed slices. `settled` includes durable vectors,
closed durable fences, and terminal provider skips; `remaining` is the exact accepted id set an
identical next sweep would still offer to provider work. The legacy `outstanding` field remains as
an alias and must equal `remaining`. A legacy or malformed producer cannot establish that
partition, so all three counts surface as `null` under `state: 'unobservable'` rather than as a
reassuring zero. `lastDecreasedAt` advances only when `remaining` decreases; repeated observation
alone does not make a stalled corpus look fresh.

For authenticated remote MCP diagnostics, the deployment-state bridge also projects a redacted
`tenantRepoSync` section into `inspect_deployment` / `get_deployment_state_snapshot`. Use that
surface when a cloud KB is healthy but empty: it combines the orchestrator enablement gate, task
state, config-tier counts, per-repo due/backoff state, and bounded failure codes without exposing
clone URLs, credentials, or raw logs. If tenant-config graph discovery itself fails, the snapshot
reports a degraded/unreadable config state rather than flattening that failure into
`no-configured-repos`. Its `checkpointRevalidation` aggregate reports the
current contract version plus pending, failed, complete, uninitialized, and
unsupported counts. Present-but-malformed version fields fail closed by making
the checkpoint aggregate unavailable; counts are likewise unavailable when repo
enumeration or revision-state reading fails. Existing per-repo rows add only the version values and
`checkpointStatus` beside their already-hashed identities.

The same section exposes `accessReadiness`. Its aggregate is `ready` only when every enabled
required repo has current process-local capability evidence; otherwise it is `degraded`,
`unknown`, or `not-required`, with ready/degraded/unknown/checked counts. Each already-hashed
repo row adds only `{status, code, checkedAt}`. A process restart clears this volatile evidence,
and evidence expires after two effective repo-cadence windows (with a fifteen-minute floor), so
inspection reports `unknown` until the next sync sweep re-probes. Inspection itself never launches
Git or network work. Clone URLs, refs, credential references, env names, file/key paths,
usernames, fingerprints, Git output, and stacks never enter the snapshot.

### Repo Freshness Status Enum

| Status | Meaning | Transition |
|---|---|---|
| `active` | Last cycle succeeded; lane is on its normal cadence | Successful sync from any non-`disabled` status |
| `partial-progress` | A clean repo slice committed durable vector progress but retained its head checkpoint because work remains | Slice budget fired; the next repo is admitted in the same sweep |
| `lease-yield-deferred` | Repo was due but remained queued after an active repo observed the outer lease bound | Next sweep after the wrapper releases and later reacquires the outer lease |
| `degraded` | Last cycle failed but retry budget remains; lane will retry on next tick | First non-success after `active` |
| `quarantined` | Consecutive failures exceeded the backoff threshold; operator action needed | Implementation tracked in [#11942](https://github.com/neomjs/neo/issues/11942) (per-repo backoff state). Until that lands, repeated failure surfaces as `degraded` with the same operator-runbook guidance |
| `disabled` | Operator explicitly disabled the repo in `tenantRepos[]` config | Config flag; not a runtime transition |

Status is computed from per-repo `lastIngestedRev` + recent-failure-count state; the projection is deterministic, no separate persisted status column.

### Stable Error Code Taxonomy

Per-repo failures carry a stable `lastErrorCode` field on the health payload; operators branch on `error.code`, not message prose. Codes live in [`TenantRepoSyncErrors.mjs`](../../../ai/daemons/orchestrator/services/TenantRepoSyncErrors.mjs). When a sibling subsystem such as `GitMirror` already produced a stable, redacted `KB_*` code, the health payload and deployment bridge also expose `lastSourceErrorCode` so operators can distinguish credential/clone/fetch failures from generic ingest failures without raw stderr or credentials.

| Code | Where it surfaces | Trigger |
|---|---|---|
| `KB_TENANT_REPO_SYNC_SYNC_FAILED` | per-repo `lastErrorCode` | Underlying clone/fetch/envelope/ingest failure (wraps the original error after secret redaction at the GitMirror boundary) |
| `KB_TENANT_REPO_SYNC_EMPTY_MATERIALIZATION` | per-repo `lastErrorCode` | A manifest-bearing full materialization returned an error-free summary but proved neither a fresh positive ingest/delete effect nor a matching unacknowledged retry receipt. The previous checkpoint is retained. |
| `KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED` | outer `details.reasonCode` | Manual CLI requested a `--repo-slug` that is not present in `tenantRepos[]` config. CLI exits with code `3`. |
| `KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED` | outer `details.reasonCode` | `tenant-repo-sync-revisions.json` write failure. Next cycle settles the matching unacknowledged graph receipt without repeating KB mutation — no manual recovery needed if the underlying filesystem issue is resolved. |
| `KB_TENANT_REPO_SYNC_TENANT_NOT_FOUND` | reserved | Future `--tenant-id` CLI flag; no current emitter. |
| `KB_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT` | reserved | Future concurrency-limit gate (tracked in [#11942](https://github.com/neomjs/neo/issues/11942) AC2); no current emitter. |

The `KB_TENANT_REPO_SYNC_*` prefix distinguishes these codes from sibling-subsystem error families (`KB_GITMIRROR_*`, `KB_INGEST_*`, `KB_TENANT_REPO_ACCESS_*`).
`lastSourceErrorCode` is optional and bounded to stable `KB_*` codes only; it never carries clone URLs, credential references, tokens, raw repository identities, or git stderr.

Access preflight uses the provider-neutral `KB_TENANT_REPO_ACCESS_*` family:
`READY`, `CREDENTIAL_INVALID`, `TIMEOUT`, `TRANSPORT_FAILED`,
`DENIED_OR_NOT_FOUND`, `REF_NOT_FOUND`, `REF_UNVERIFIED`, and the bounded fallback
`PROBE_FAILED`. `PROBE_UNAVAILABLE` means the scheduler could not obtain the
GitMirror preflight surface, while `SYNC_FAILED` means a later authoritative
clone/fetch failed. A raw commit SHA that is not an advertised ref tip reports
`REF_UNVERIFIED` rather than falsely reporting it missing; normal fetch remains
the authority for that revision. These codes prove capability categories only; they do not
infer PAT, deploy-token, group-token, or provider-specific scope metadata.

### Quarantine Runbook

When a repo enters `quarantined`, the lane stops attempting it on periodic cycles until the operator acts. Steps:

1. Read the per-repo `lastErrorCode` from the health payload. Stable codes follow the `KB_TENANT_REPO_SYNC_*` prefix (e.g., `KB_TENANT_REPO_SYNC_SYNC_FAILED`, `KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED`).
2. If present, read `lastSourceErrorCode` to identify the failing subsystem before falling back to logs.
3. Common cases:
   - `lastSourceErrorCode: KB_GITMIRROR_CREDENTIAL_REF_INVALID` → confirm the env var or secret file named by `credentialRef` exists and is non-empty.
   - `lastSourceErrorCode: KB_GITMIRROR_CLONE_FAILED` / `KB_GITMIRROR_FETCH_FAILED` → verify upstream access, token read scope, repo path, and network egress.
   - `lastErrorCode: KB_TENANT_REPO_SYNC_EMPTY_MATERIALIZATION` → inspect parser/ingestion output. A fresh full attempt needs a positive ingest/delete effect; only an interrupted checkpoint commit may recover through its matching unacknowledged graph receipt.
   - Persistent network/DNS error → the deployment can't reach the upstream remote; verify network egress.
   - Repository deleted / renamed upstream → update the `tenantRepos[]` config or remove the entry.
4. Once the underlying issue is resolved, retry via `node ./ai/scripts/maintenance/syncTenantRepos.mjs --repo-slug <slug>`. Current releases preserve the last known-good checkpoint on any returned ingestion error.
5. If the deployment was upgraded from a release that could checkpoint an error-bearing summary, or the ordinary retry produces no files because the stored base is already the failed head, run `node ./ai/scripts/maintenance/syncTenantRepos.mjs --full --repo-slug <slug>`. A failed replay retains the old checkpoint; only an error-free replay replaces it and returns the repo to `active`.

The lane never silently abandons a `quarantined` repo — operator action is the recovery path. Webhook-driven retry on git push is deferred.

### Operator Logging

Each `runTask` cycle emits per-repo log lines in this shape:

```text
[TenantRepoSync] Refreshing neomjs/create-app.
[TenantRepoSync] neomjs/create-app completed: head=a1b2c3d4 ingested=12 deleted=1 (842ms)
[TenantRepoSync] neomjs/create-app failed: KB_TENANT_REPO_SYNC_SYNC_FAILED (auth failed) [redacted]
[TenantRepoSync] Cycle summary: 3 repos, 1 completed, 0 deferred, 0 failed, 1 partial-progress, 0 not-due, 0 revalidation-deferred, 1 lease-yield-deferred — OUTER LEASE YIELDED.
```

All credential material and raw git stderr passes through `redactTenantRepoSecrets()` before logging. The deployment log MUST NOT carry `https://user:token@...` URLs, resolved secrets, or stderr that includes the secret material.

### Push-vs-Pull Coexistence

A single `repoSlug` can be served by both surfaces, but the operational rules are:

- Server-derived `tenantId` stamping is authoritative regardless of which surface delivered the content. A push-mode tenant can't claim a different `tenantId` than its authenticated identity; a pull-mode entry uses the `tenantRepos[]` config's `tenantId`.
- If both surfaces write to the same `(tenantId, repoSlug)`, the most recent revision wins for the next ingest envelope. The deletion-signaling contract (tombstones, manifests, baseRevision/headRevision) keeps state consistent across alternation, but operators should expect noisy revision history.
- Local maintainer checkout sync (`primary-dev-sync`, `kbSync`) is NEVER repointed at tenant content. Tenant content lives only in tenant-namespaced `(tenantId, repoSlug)` keys; the maintainer-checkout lanes remain scoped to the operator's own neomjs/neo repo.

### Cross-Subsystem Surfaces

- **Deployment compose / volume:** add `tenant-repo-mirrors` to the `cloud` profile and mount at `NEO_TENANT_REPO_MIRROR_ROOT`. See [`DeploymentCookbook.md`](../DeploymentCookbook.md) for the canonical compose shape.
- **Tenant config storage:** `tenantRepos[]` is persisted via `KnowledgeBaseIngestionService.setTenantConfig({tenantId, config})` when a tenant-config operator tool is added. Cross-tenant writes remain rejected by the existing RLS gate; missing/invalid `credentialRef` or credential-bearing `cloneUrl` surfaces stable rejection errors at normalization.
- **Parser/source-family dispatch:** pull-mode files enter the same parser/source-family model as push/bulk ingestion. No new parser contract is introduced by server-side git acquisition; the [Parser Dispatch](#parser-dispatch) and [Source-Family Inventory](#source-family-inventory) tables above apply unchanged. Unsupported source families use [`CustomSources.md`](./CustomSources.md) / [`CustomParsers.md`](./CustomParsers.md) guidance, not a pull-specific path.
- **Deletion telemetry:** the `lastSyncDeletedCount` health field surfaces the per-cycle deletion count from the ingestion summary. The pull caller accepts only a summary with an array-valued, empty `errors` field; a fresh full materialization additionally requires an attempt-bound positive safe-integer ingest/delete receipt. Partial ingest, malformed or fresh zero-effect full summary leaves `lastIngestedRev` unchanged. A post-ingest checkpoint-write failure also leaves the local head unchanged, but its unacknowledged graph receipt lets the next cycle settle the already-applied deletion idempotently.

## Evidence Boundary

This guide is an L1 operational contract. It does not require new runtime behavior by itself. Add tests only when implementation touches a real seam, for example:

- repoSlug normalization or rejection logic;
- credential-bearing URL redaction/rejection;
- parser-dispatch branching;
- manifest/tombstone handling;
- tutorial fixture executability.

The day-0 tutorial should reuse this model rather than redefine it.

## Related

- [Hook Wiring](./HookWiring.md) — the `ingest_source_files`, `ai:kb-push-client`, and `ai:ingest-tenant` surfaces.
- [Custom Parsers](./CustomParsers.md) — `parsed-chunk-v1` and parser execution boundaries.
- [Custom Sources](./CustomSources.md) — full-corpus Source path, mostly not the push-based tenant default.
- [Security](./Security.md) — tenant stamping, spoof rejection, parser trust, and KB-as-cache recovery.
- [#11721](https://github.com/neomjs/neo/issues/11721) — D0 scheduler taxonomy that separates local-only maintainer sync from cloud tenant ingestion.
- [`identity-tuple.md`](../../../ai/services/knowledge-base/parser/identity-tuple.md) — authoritative path identity tuple.
- [`deletion-signaling-contract.md`](../../../ai/services/knowledge-base/parser/deletion-signaling-contract.md) — tombstone, manifest, and revision-boundary mechanics.
