# Cloud-Native KB Ingestion — Custom Parsers

> **Status — Phase 3B.** This guide documents how a cloud tenant turns its own file formats into Knowledge Base chunks — the `parsed-chunk-v1` contract and the parser registration surface shipped across Phase 0/1 and Phase 2 of Epic [#11624](https://github.com/neomjs/neo/issues/11624). A worked custom parser ships alongside this guide under [`ai/examples/cloud-deployment/`](../../../ai/examples/cloud-deployment/).

## Source vs Parser

The KB ingestion substrate splits content acquisition into two roles (see [Overview](./Overview.md)):

- A **Source** locates and reads content from a territory — used by the full-corpus build (`ai:sync-kb`). See [Custom Sources](./CustomSources.md).
- A **Parser** transforms one file *format* into chunk content. A parser is what the **push path** (`ingest_source_files`, `ai:ingest-tenant` — see [Hook Wiring](./HookWiring.md)) invokes to turn a tenant's raw file into `parsed-chunk-v1` records.

Both register in the same `SourceRegistry` singleton. This guide covers parsers — the format layer a cloud tenant most often needs to extend, because a tenant's repos rarely contain only the formats Neo's built-in parsers (`SourceParser` for ES modules, `DocumentationParser` for Markdown, `TestParser`) understand.

The tenant-level choice of which source families use server parsers, client-side `parsed-chunk-v1`, or an explicit unsupported status is defined in [Tenant Ingestion Model](./TenantIngestionModel.md).

## The `parsed-chunk-v1` contract

Every chunk entering the KB through the push path conforms to [`parsed-chunk-v1`](../../../ai/services/knowledge-base/parser/parsed-chunk-v1.schema.json) — the ingest contract. A parser's job is to emit records of this shape. The required fields:

| Field | Meaning |
|---|---|
| `schemaVersion` | The constant `"1.0.0"`. The ingestion service validates an exact match. |
| `tenantId` | The tenant's claim — server-overwritten with the authoritative value. Lowercase kebab. |
| `repoSlug` | The tenant repo this chunk belongs to. |
| `rootKind` | `neo-workspace` \| `bare-repo` \| `external-source`. |
| `sourcePath` | Path relative to the `repoSlug` root, forward-slash normalized, no leading slash. |
| `content` | The chunk text — what gets embedded. |
| `hashInputs` | The field names that compose the chunk's content hash. The server prepends `tenantId` + `repoSlug` implicitly. |
| `parserId` | The id of the parser that produced the chunk (provenance + protocol versioning). |
| `parserVersion` | A semver string for the parser. |
| `kind` | Open-enum semantic category (`doc-section`, `method`, `class-config`, …). |
| `name` | Human-readable chunk name. |

Optional: `line_start`, `line_end`, `className`, `extends`, and `customMeta` (an open extension slot). The schema is `additionalProperties: false` — unknown top-level keys are rejected; put parser-specific extras in `customMeta`.

**One field is forbidden: `embedding`.** A record carrying an `embedding` is a *restore* record (`backup-record-v1`), not an ingest record. The ingestion service rejects any `parsed-chunk-v1` record with an `embedding` field (`KB_PARSED_CHUNK_EMBEDDING_REJECTED`) — embeddings are always generated server-side. Every record is Ajv-validated against the schema at ingest; a non-conforming record is rejected (`KB_PARSED_CHUNK_INVALID`) without aborting its sibling records in the same push.

## Two places a parser can run

A tenant's file format can be parsed in either of two places — the choice is a **trust** decision (see [Security](./Security.md)):

### Client-side (recommended for non-JS and untrusted formats)

The tenant runs the parser in its **own** environment and pushes already-formed `parsed-chunk-v1` records. No parser code runs on the deployment. The push envelope carries the records directly:

- `ingest_source_files` — a `files` entry of the shape `{sourcePath, parsedChunks: [ /* parsed-chunk-v1 */ ]}`, or a `files` entry that *is itself* a `parsed-chunk-v1` record (`schemaVersion: "1.0.0"`).
- `ai:ingest-tenant` — one `parsed-chunk-v1` record per JSONL line.

This is the **only** path for a non-JS source format: a tenant with C++, Python, or `.proto` files writes a parser in whatever language and tooling it likes (tree-sitter, a language-native AST library, a regex pass), emits `parsed-chunk-v1` JSON, and pushes it. The deployment never executes the tenant's parser — it only validates and embeds the records. Non-JS parser *distribution* is therefore a tenant-side concern; Neo's substrate sees only the JSON output.

### Server-side (operator-gated)

A parser class registered on the deployment runs **in the deployment's process** when a tenant pushes a *raw* file (`{sourcePath, content, parserId}`) and the server resolves `parserId` to that class. Because this executes parser code in the shared server process, it is an **operator-gated** surface: a tenant cannot register server-side parser code without operator review — `aiConfig.customParsers` is a deployment config, not a tenant-supplied payload. Use server-side parsers only for operator-installed, Neo-shipped, or signed-package parsers.

## Authoring a server-side parser

A parser is a Neo class registered in `SourceRegistry` under a stable `parserId`:

- **Declaratively** — list it in `aiConfig.customParsers` (loaded once at boot).
- **Programmatically** — `SourceRegistry.registerParser(ParserClass, {parserId})`.

`aiConfig.useDefaultParsers` (default `true`) controls whether Neo's built-in parsers are present; a deployment serving only non-Neo content can set it `false`.

A registered parser implements one of two methods — the ingestion service (`resolveFileChunks`) dispatches on whichever is present:

1. **`parseIngestionFile(file, {tenantContext})` → `parsed-chunk-v1[]`** *(recommended for new parsers).* Receives the push envelope's `files` entry plus the resolved tenant context (`tenantId`, `repoSlug`, `visibility`, …), and returns `parsed-chunk-v1` records directly — no adapter, no signature ambiguity.
2. **`parse(content, sourcePath, type, hierarchy)` → legacy chunks** *(the contract Neo's built-in `SourceParser` uses).* Returns chunks of the legacy `{type, kind, name, content, source, …}` shape; the ingestion service adapts each into `parsed-chunk-v1` via `legacyChunkToParsedRecord` (it defaults `rootKind: 'external-source'` and `hashInputs: ['kind','name','content','sourcePath','parserId','parserVersion']`).

If a pushed file names a `parserId` that is not registered, the ingestion service returns `KB_PARSER_NOT_REGISTERED` for that file. A raw file with no `parserId` falls through to the built-in `raw-text` handling — the whole file becomes a single chunk.

## The parser-execution boundary

The trust rule is invariant (see [Security](./Security.md) for the full model): **untrusted parsing happens tenant-side; server-side parser execution is operator-gated.** A cloud tenant extending the KB with a new format defaults to the client-side path — it needs no operator coordination, runs no code in the shared process, and supports any source language. The server-side path is reserved for parsers the operator has explicitly vetted.

A runtime sandbox for in-process execution of tenant-supplied parser code (WASM / tree-sitter isolation) is out of scope for V1 — it graduates via a separate Discussion if the need materializes.

## Related

- [Overview](./Overview.md) — the Source/Parser registry split and the contract layering.
- [Tenant Ingestion Model](./TenantIngestionModel.md) — source-family inventory and dispatch choices for external tenant repos.
- [Hook Wiring](./HookWiring.md) — the `ingest_source_files` / `ai:ingest-tenant` push facades that invoke parsers.
- [Custom Sources](./CustomSources.md) — the full-corpus `Source` counterpart.
- [Configuration](./Configuration.md) — `useDefaultParsers`, `customParsers`, and the rest of the `aiConfig` surface.
- [Security](./Security.md) — the parser-execution trust boundary.
- [`parsed-chunk-v1.schema.json`](../../../ai/services/knowledge-base/parser/parsed-chunk-v1.schema.json) — the authoritative ingest-chunk schema.
- [#11629](https://github.com/neomjs/neo/issues/11629) Phase 0/1A contracts · [#11630](https://github.com/neomjs/neo/issues/11630) Phase 0/1B registry · [#11634](https://github.com/neomjs/neo/issues/11634) `ingest_source_files`.
