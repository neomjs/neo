# Cloud-Native KB Ingestion — Hook Wiring

> **Status — Phase 3B + #11743.** This guide documents the shipped ingestion surfaces of Epic [#11624](https://github.com/neomjs/neo/issues/11624) plus the #11743 tenant-side repo-push client: the `ingest_source_files` MCP operation ([#11634](https://github.com/neomjs/neo/issues/11634)), the `npm run ai:kb-push-client` remote MCP wrapper, and the `npm run ai:ingest-tenant` bulk CLI ([#11635](https://github.com/neomjs/neo/issues/11635)). The runnable `pre-push` hook and worked external workspace it references ship under [`ai/examples/cloud-deployment/`](../../../ai/examples/cloud-deployment/).

## Three operator surfaces, one ingestion service

A tenant's source content reaches the Knowledge Base through the same `KnowledgeBaseIngestionService.ingestSourceFiles` orchestrator and writes to the unified Chroma `knowledge-base` collection. The operational surfaces differ in **who calls them**, **where they run**, and **work-volume policy**.

For the operator-facing decision model — how to choose repo slugs, treat credentials, inventory source families, and decide when to use each facade — read [Tenant Ingestion Model](./TenantIngestionModel.md) first.

| Surface | Caller | Volume policy | Built for |
|---|---|---|---|
| `ingest_source_files` | A remote MCP client of the Streamable HTTP deployment — an agent in the tenant workspace, or a tenant push client | Gated — refuses a batch over `mcpSyncMaxChunks` (default 50); listed/callable only when the KB server runs with `transport === 'streamable-http'` | Incremental pushes: a commit's worth of changed files |
| `npm run ai:kb-push-client` | A tenant git hook or CI job; wraps the remote MCP call | Same MCP gate as `ingest_source_files` | Operator-facing repo-push invocation over the configured remote MCP client transport |
| `npm run ai:ingest-tenant` | A shell process co-located with the KB server — the cloud operator, a CI job | Ungated (`viaMcp: false`) | Initial tenant onboarding (5k–50k chunks), large back-fills |

The fork between them is the [#10572](https://github.com/neomjs/neo/issues/10572) **MCP work-volume gate**. An MCP tool call holds the calling agent's turn open; embedding tens of thousands of chunks synchronously inside one call is the wrong shape. The gate makes that structural — `ingest_source_files` *refuses* an over-volume batch (it returns a refusal payload, it does not block), and the bulk CLI is the sanctioned path for the volume the gate rejects. `viaMcp: false` — passed only by the CLI — is the single sanctioned gate bypass.

## Transport and auth model

The KB MCP server runs dual-transport (`ai/mcp/server/knowledge-base/Server.mjs`): `stdio` for a local single-repo deployment, or `streamable-http` for a cloud deployment serving remote tenants — selected by `aiConfig.transport` with `aiConfig.mcpHttpPort`. `ingest_source_files` is transport-gated: it is listed and callable only when the KB server runs with `transport === 'streamable-http'`. Local `stdio` clients do not see it and direct calls fail closed with guidance to use the local CLI/service path instead. The `ai:ingest-tenant` CLI is **not** a remote facade — it imports the KB services directly and runs on the deployment host.

The deployable repo-push path is `npm run ai:kb-push-client`. It is a tenant-side MCP client wrapper around `ingest_source_files`:

```bash
NEO_KB_MCP_URL="https://agent-os.example.com/kb/mcp" \
NEO_KB_INGEST_TOKEN="$repo_push_token" \
NEO_KB_TENANT_ID="client-org" \
NEO_KB_REPO_SLUG="neomjs/create-app" \
npm run ai:kb-push-client -- --from-stdin < envelope.json
```

The operator-facing primitive is the **repo-push automation identity**, not a human agent session:

1. Create a service account or machine client in the deployment's OIDC provider, for example `kb-repo-push-client-org`.
2. Configure the token audience/resource to match the KB deployment's public MCP resource. Behind the reference Caddy ingress, that means the canonical KB public URL exposed by `NEO_PUBLIC_URL` plus the `/mcp` endpoint path, commonly `https://agent-os.example.com/kb/mcp`.
3. Store the access token or client-credentials exchange output in the tenant hook/CI secret store, exposed to the hook as `NEO_KB_INGEST_TOKEN`. Do not commit it, put it in `repoSlug`, or log it.
4. Scope the identity to the tenant it represents. The server stamps the authoritative tenant identity from authenticated context; payload `tenantId` remains a default/claim, not authority.

If a deployment deliberately runs unauthenticated for a local demo, pass `--allow-unauthenticated`; production tenant ingestion should not use that flag.

## The incremental facade — `ingest_source_files`

`ingest_source_files` accepts a push envelope:

```jsonc
{
  "tenantId": "client-org",                  // the client's claim; the server stamps the authoritative value
  "files": [
    { "sourcePath": "src/foo.mjs", "content": "<raw file text>" },           // raw — server parses
    { "sourcePath": "src/bar.mjs", "parsedChunks": [ /* parsed-chunk-v1 */ ] } // client-parsed
  ],
  "deleted":          [ { "sourcePath": "src/gone.mjs", "repoSlug": "main-app" } ],
  "manifestSnapshot": { "repoSlug": "main-app", "pathsAfterPush": [ "src/foo.mjs", "src/bar.mjs" ] },
  "baseRevision":     "<last-pushed-SHA>",
  "headRevision":     "<current-SHA>"
}
```

No envelope field is strictly required — the ingestion service validates and returns a structured summary rather than throwing. A `files` entry is resolved to `parsed-chunk-v1` records by one of several paths: a raw `{content}` payload is parsed server-side by a registered parser (`parserId`, default `raw-text`); a `{parsedChunks: [...]}` payload carries client-side parsed records; an entry that is itself a `parsed-chunk-v1` record (`schemaVersion: '1.0.0'`) passes straight through. See [Custom Parsers](./CustomParsers.md) for the parser side.

**The volume gate.** Batch volume is the summed `parsedChunks` length across `files`, counting each raw file as 1. Over `mcpSyncMaxChunks` (default 50), the call refuses *up front* — before embedding — and returns:

```jsonc
{
  "error":     "KB ingest work volume exceeds MCP-callable threshold",
  "code":      "KB_INGEST_VOLUME_EXCEEDED",
  "message":   "<split-the-batch guidance>",
  "batchSize": 312,
  "threshold": 50
}
```

A caller branches on `code`: split into sub-threshold `ingest_source_files` calls, or hand the back-fill to the bulk CLI. A successful call returns `{ingested, deleted, embeddingsGenerated, errors, tenantId, durationMs}`.

## Tenant push client — `npm run ai:kb-push-client`

The push client accepts a single JSON envelope and submits it to the remote MCP endpoint:

```bash
npm run ai:kb-push-client -- \
    --url https://agent-os.example.com/kb/mcp \
    --tenant-id client-org \
    --repo-slug neomjs/create-app \
    --from-file envelope.json
```

Environment defaults:

| Variable | Meaning |
|---|---|
| `NEO_KB_MCP_URL` | Remote KB MCP endpoint URL, for example `https://agent-os.example.com/kb/mcp`. |
| `NEO_KB_MCP_TRANSPORT` | Client transport; `streamable-http` by default, `sse` for older endpoint wiring. |
| `NEO_KB_INGEST_TOKEN` | Bearer token for the repo-push automation identity. |
| `NEO_KB_TENANT_ID` | Optional envelope default; server-side auth still stamps the authoritative tenant. |
| `NEO_KB_REPO_SLUG` | Optional envelope default for records/manifests that omit `repoSlug`. |

Failure signatures a hook/CI job should branch on:

| Signature | Meaning | Operator response |
|---|---|---|
| `KB_INGEST_VOLUME_EXCEEDED` | Batch exceeds `mcpSyncMaxChunks`. | Split the envelope or use `ai:ingest-tenant` for bulk onboarding/backfill. |
| HTTP 401 / `Unauthorized` | Token missing, expired, wrong audience/resource, or rejected by proxy/auth middleware. | Refresh the automation identity token and verify `NEO_PUBLIC_URL` / audience wiring. |
| Tool not listed / MCP call rejected | The endpoint is not the KB MCP server, transport config is wrong, or the deployment gates ingest tools by transport/auth. | Verify `NEO_KB_MCP_URL`, transport, and server config before retrying. |
| Non-empty `errors` array | The ingestion service accepted the call but one or more files failed validation/parsing. | Fail the hook/CI job and surface the structured `{code, message}` entries. |

This client is the current #11743 MCP-over-StreamableHTTP answer. A non-MCP HTTP or queue receiver that reuses `KnowledgeBaseIngestionService` remains a future alternative if the MCP client path proves operationally awkward. Server-side ref-only webhook/clone ingestion remains the separate [#11731](https://github.com/neomjs/neo/issues/11731) exploration.

## The bulk facade — `npm run ai:ingest-tenant`

For the volume the gate rejects, the Phase 2C CLI streams a JSONL file into the ingestion service:

```bash
npm run ai:ingest-tenant -- <tenantId> (--from-file <path.jsonl> | --from-stdin) [--batch-size <n>]
```

- **Input** — JSONL, one ingestion `files` entry per line: a `parsed-chunk-v1` record, or a raw `{sourcePath, content}` payload the server will parse. A line that fails `JSON.parse` is counted as a `KB_INGEST_CLI_JSONL_PARSE_FAILED` error and skipped — one malformed line never aborts the stream.
- **`--batch-size`** — records per `ingestSourceFiles` call (default 500); the stream is flushed batch-by-batch, so a multi-thousand-record import never materializes the whole corpus in memory.
- **Heavy-maintenance lease** — the run holds the shared heavy-maintenance lease so a bulk import cannot collide with `ai:sync-kb` or the orchestrator's `kbSync` task on the unified `knowledge-base` collection. If another holder has the lease, the run prints `Deferred: heavy-maintenance lease held by '<owner>'` and exits 0 — re-invoke once the holder completes.

The CLI prints a JSON summary — `{tenantId, ingested, embeddingsGenerated, deleted, batches, parseErrors, errors}` — and exits non-zero if any error was accumulated.

> The CLI submits each batch as a plain `files` array — it does **not** carry `deleted` / `manifestSnapshot` / revision-boundary fields. Bulk imports are initial-load or full-resync; per-push deletion signaling is an `ingest_source_files` concern (see below). Because every chunk carries `metadata.ingestedAt`, chunks imported by the CLI after the last persisted manifest are outside that manifest's deletion authority; run a later manifest-carrying push or full claimed-state resync when the operator wants to advance the manifest baseline.

## Deletion signaling

An incremental push carries only *changed* files, so the server cannot infer deletions. The `ingest_source_files` envelope therefore carries explicit deletion signals — a push MAY combine any of three:

| Mechanism | Envelope field | Shape | Trade-off |
|---|---|---|---|
| Tombstones | `deleted` | `[{sourcePath, repoSlug}]` | Cheap, single-record granular; the client tracks its own deletes |
| Manifest snapshot | `manifestSnapshot` | `{repoSlug, pathsAfterPush: [...]}` | Robust against missed deletes; O(N) payload in post-push file count; durable baseline for daemon reconciliation |
| Revision boundary | `baseRevision` + `headRevision` | last-pushed + current SHA | Cheapest signal; the server derives the delete set from the tenant's tracked revision |

When a payload carries more than one, the server applies them in precedence order — revision-boundary computes the expected change set, tombstones extend it, the manifest reconciles surplus chunks as orphans. **Revision-boundary deletion additionally requires Phase 2E tenant config storage** ([#11637](https://github.com/neomjs/neo/issues/11637)): the resolver that maps a SHA range to deleted paths is wired by that phase; until it lands, a revision-boundary-only payload returns `KB_REVISION_BOUNDARY_UNAVAILABLE`, and tombstones + manifest remain the available signals. The full contract is in [`deletion-signaling-contract.md`](../../../ai/services/knowledge-base/parser/deletion-signaling-contract.md).

`manifestSnapshot` is also persisted on the sibling graph node `kb-manifest:<tenantId>` (#11711), keyed by `repoSlug` with its `updatedAt` timestamp. The Phase 4B reconciliation daemon can later classify persisted chunks that are absent from the latest manifest as manifest orphans, but only inside the manifest's freshness window: `metadata.ingestedAt` must be finite and `<= manifest.updatedAt`. Chunks missing `ingestedAt`, or chunks ingested after the manifest was written, are skipped because the manifest cannot speak for content added by a bulk import or a minimal hook after that snapshot.

Enable `reconciliationAutoTombstone` only when the tenant hook topology sends full manifest snapshots at the reconciliation points that should authorize deletes. Tombstone/revision-boundary-only hooks remain safe and cheap; they just should not rely on an older manifest to delete content created after that older manifest until a later manifest-carrying push advances the baseline.

## Wiring a `pre-push` git hook

A `pre-push` hook is the recommended trigger: it fires once per `git push`, receives the pushed ref range on stdin, and runs before the remote updates. The reference implementation is [`ai/examples/cloud-deployment/pre-push-hook.sh`](../../../ai/examples/cloud-deployment/pre-push-hook.sh); its shape:

1. Read the pushed ref range (`<local-ref> <local-sha> <remote-ref> <remote-sha>`) from the hook's stdin.
2. Enumerate changed files — `git diff --name-only --diff-filter=ACMR <remote-sha> <local-sha>` for adds/modifies, `--diff-filter=D` for deletes.
3. Assemble the envelope — changed files into `files`, deleted paths into `deleted`, the SHA pair into `baseRevision` / `headRevision`.
4. Submit it — when `NEO_KB_MCP_URL` is configured, pipe the envelope to `ai:kb-push-client`, which calls the remote `ingest_source_files` endpoint; an initial import of an existing repo still goes to the deployment-host bulk CLI. In local `stdio` mode, use the CLI/service path instead; the MCP tool is intentionally hidden.
5. Inspect the returned summary — a non-empty `errors` array fails the hook so the developer sees it.

The example combines **tombstones + revision-boundary** — the precise-but-cheap pair for a hook that already runs `git diff`.

## `post-commit` vs `pre-push`

| Hook | Fires | Best mechanism | Notes |
|---|---|---|---|
| `pre-push` | once per `git push` | tombstones + revision-boundary | Recommended default — batches a push's commits, SHA range on stdin |
| `post-commit` | every commit | revision-boundary only | High frequency; keep payloads minimal. The Phase 4B reconciliation daemon can catch drift only within the last persisted manifest's freshness window; rows ingested after that manifest are skipped until a later manifest-carrying push advances the baseline. |

## Error handling — the structured summary

`ingestSourceFiles` does not throw for per-file problems. It returns a summary whose `errors` array accumulates structured `{code, message}` entries — a non-empty array does **not** imply total failure (sibling files in the same batch may have ingested cleanly). A caller should:

- treat `KB_INGEST_VOLUME_EXCEEDED` as "split the batch / use the bulk CLI", not as a failure;
- surface a non-empty `errors` array to the developer — fail the hook — so a malformed file or an unregistered parser is not silently dropped;
- treat the bulk CLI's non-zero exit code the same way — it exits non-zero whenever `errors` is non-empty.

## Related

- [Overview](./Overview.md) — the contract split, topology anchor, default-source inheritance.
- [Tenant Ingestion Model](./TenantIngestionModel.md) — tenant repo identity, credential boundary, source-family inventory, and push-vs-bulk operational flow.
- [Configuration](./Configuration.md) — `mcpSyncMaxChunks`, `transport`, and the other `aiConfig` keys.
- [Custom Parsers](./CustomParsers.md) — authoring a parser that turns a tenant file format into `parsed-chunk-v1` records.
- [Security](./Security.md) — write-side stamping, spoof-rejection, and the parser-execution boundary.
- [`deletion-signaling-contract.md`](../../../ai/services/knowledge-base/parser/deletion-signaling-contract.md) · [`identity-tuple.md`](../../../ai/services/knowledge-base/parser/identity-tuple.md) — the ingestion contracts.
- [#11743](https://github.com/neomjs/neo/issues/11743) repo-push receiver/auth model · [#11634](https://github.com/neomjs/neo/issues/11634) `ingest_source_files` · [#11635](https://github.com/neomjs/neo/issues/11635) `ai:ingest-tenant` · [#10572](https://github.com/neomjs/neo/issues/10572) MCP work-volume gate.
