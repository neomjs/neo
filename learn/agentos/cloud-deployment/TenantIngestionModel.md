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
| `ingest_source_files` | A tenant agent or push client sends a bounded incremental change set to the cloud MCP endpoint running with `transport === 'sse'`. | MCP-callable only in the remote StreamableHTTP profile and volume-gated by `mcpSyncMaxChunks`; split or use the CLI when the gate refuses. |
| `npm run ai:kb-push-client` | A tenant git hook or CI job needs an operator-facing invocation wrapper for the remote MCP call. | Runs in the tenant workspace, uses StreamableHTTP/SSE, carries an automation identity bearer token, and preserves the MCP gate. |
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
acme/app
acme/docs
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
- Optional server-side pull config uses `tenantRepos[]` entries with clean `cloneUrl`, reference-only `credentialRef`, and normalized `repoSlug` (#11787). Credential-bearing `userinfo@` clone URLs are rejected before graph persistence; credential injection belongs to the `GitMirror` primitive (#11788). `GitMirror` resolves the credential reference only for the git subprocess invocation (`GIT_ASKPASS` for HTTPS, `GIT_SSH_COMMAND` for SSH) and keeps mirror contents on the deployment `tenant-repo-mirrors` volume mounted at `NEO_TENANT_REPO_MIRROR_ROOT`.

Credential-bearing Git URLs are therefore rejected or treated as deferred clone-exploration input. They must not appear in:

- `repoSlug`
- logs
- manifests
- tutorial snippets
- graph-visible configuration
- source-family inventory output

If a future server-side clone path becomes necessary, [#11731](https://github.com/neomjs/neo/issues/11731) owns the credential transport and storage contract before implementation begins.

## Repo-Push Automation Identity

For day-0 tenant push, create a machine/service account in the deployment's OIDC provider and scope it to the tenant repository source it represents. The tenant hook or CI job stores the resulting access token in its secret store and exposes it as `NEO_KB_INGEST_TOKEN`.

The deployment's OAuth audience/resource must match the KB MCP public resource. Behind the reference ingress, the client URL is typically:

```text
https://agent-os.example.com/kb/mcp
```

The token's resource should match the canonical KB public URL configured by `NEO_PUBLIC_URL` / the auth provider. The exact token acquisition flow is operator-owned — client credentials, workload identity, or CI OIDC exchange are all valid — but the resulting token must be short-lived or rotated, tenant-scoped, and stored outside the repository.

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
5. Create the repo-push automation identity, configure token audience/resource, and store the token as `NEO_KB_INGEST_TOKEN` in the tenant hook or CI secret store.
6. Wire incremental `pre-push` or CI pushes through `ai:kb-push-client` to the remote MCP endpoint.
7. Include tombstones and revision boundaries; include manifests at reconciliation points.
8. Fail the hook or CI job on structured ingestion errors instead of silently dropping files.
9. Verify retrieval against the tenant corpus plus `neo-shared` content before handing the deployment to agents.

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
