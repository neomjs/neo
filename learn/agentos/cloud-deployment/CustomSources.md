# Cloud-Native KB Ingestion — Custom Sources

> **Status — Phase 3B.** This guide documents how a deployment teaches the Knowledge Base to index a new content territory by authoring a custom `Source` class — the Phase 0/1B `SourceRegistry` substrate of Epic [#11624](https://github.com/neomjs/neo/issues/11624). A runnable custom Source ships alongside this guide under [`ai/examples/cloud-deployment/`](../../../ai/examples/cloud-deployment/).

## Source vs Parser — which do you need?

The KB ingestion substrate splits content acquisition into two roles (see [Overview](./Overview.md)):

- A **Source** locates and reads content from a *territory* it can see on disk — a directory tree, a co-located repo — and feeds it into the **full-corpus build** (`npm run ai:sync-kb`).
- A **Parser** transforms one file *format* into chunk content for the **push path** (`ingest_source_files`, `ai:ingest-tenant`). See [Custom Parsers](./CustomParsers.md).

**Most cloud tenants need Custom Parsers, not Custom Sources.** A tenant pushing its content to a remote KB server uses the push path — parsers + `parsed-chunk-v1`. Custom Sources matter when a deployment runs its *own* full-corpus build over a repo it has on disk — e.g. a deployment that co-locates a tenant repo and indexes it directly rather than receiving pushes. If you are wiring git hooks to push content, start with [Hook Wiring](./HookWiring.md) and [Custom Parsers](./CustomParsers.md).

## The Source contract

A Source is a Neo class extending [`source/Base.mjs`](../../../ai/services/knowledge-base/source/Base.mjs). It implements one abstract method:

```
async extract(writeStream, createHashFn) : Promise<Number>
```

`extract` traverses its territory, builds a chunk record per unit of content, writes each as one JSON line to `writeStream`, and returns the number of chunks written. The full-corpus build (`DatabaseService.createKnowledgeBase`) calls `extract` on every registered Source in turn.

Each chunk record carries the indexable content plus the metadata the KB ranks on — the shape Neo's built-in Sources emit (see `AdrSource` for the canonical precedent):

| Field | Meaning |
|---|---|
| `type` | Coarse content category — e.g. `proto`, `guide`, `src`. |
| `kind` | Finer semantic category — e.g. `schema`, `method`, `doc-section`. |
| `name` | Human-readable chunk name. |
| `content` | The chunk text — embedded server-side. |
| `source` | The chunk's source path. |

Set `chunk.hash = createHashFn(chunk)` before writing each record. `createHashFn` is the content-hash function the build supplies; it folds the tenant identity (`tenantId`, `repoSlug`) into the hash **automatically** — a custom Source does not thread tenant fields itself (see *Identity-tuple semantics* below).

> The `extract` path is the full-corpus build's chunk contract. It is distinct from the `parsed-chunk-v1` *push* contract in [Custom Parsers](./CustomParsers.md): `parsed-chunk-v1` is the shape a tenant pushes through `ingest_source_files` / `ai:ingest-tenant`, whereas `extract` chunks are produced in-process by the full-corpus build. The two are separate ingestion paths into the same `knowledge-base` collection.

## Authoring a custom Source

A minimal Source — modelled on the built-in `AdrSource` — that indexes a tenant's `.proto` schema files:

```js
import Base     from './Base.mjs';
import fs       from 'fs-extra';
import path     from 'path';
import aiConfig from '../../../mcp/server/knowledge-base/config.mjs';

/**
 * @summary Extracts knowledge chunks from a tenant's `.proto` schema files.
 * @class MyOrg.kb.source.ProtoSource
 * @extends Neo.ai.services.knowledge-base.source.Base
 * @singleton
 */
class ProtoSource extends Base {
    static config = {
        className: 'MyOrg.kb.source.ProtoSource',
        singleton: true
    }

    async extract(writeStream, createHashFn) {
        let count = 0;
        // Path resolves from aiConfig.sourcePaths; the config leaf owns the default.
        const dir = path.resolve(aiConfig.neoRootDir, aiConfig.sourcePaths.ProtoSource);

        if (await fs.pathExists(dir)) {
            for (const file of (await fs.readdir(dir)).sort()) {
                if (!file.endsWith('.proto')) continue;

                const filePath = path.join(dir, file);
                const chunk    = {
                    type   : 'proto',
                    kind   : 'schema',
                    name   : path.basename(file, '.proto'),
                    content: (await fs.readFile(filePath, 'utf-8')).trim(),
                    source : path.relative(aiConfig.neoRootDir, filePath)
                };

                chunk.hash = createHashFn(chunk);
                writeStream.write(JSON.stringify(chunk) + '\n');
                count++;
            }
        }

        return count;
    }
}

export default Neo.setupClass(ProtoSource);
```

Sort the territory deterministically (`.sort()` above) so the generated corpus is byte-stable run-to-run.

## Registering a Source

A Source class is registered in the `SourceRegistry` singleton under a stable name:

- **Declaratively** — add it to `aiConfig.customSources` as `{SourceClass, sourceName?}` (loaded once at boot). `sourceName` defaults to the class's `className` final segment (`ProtoSource` above).
- **Programmatically** — `SourceRegistry.registerSource(ProtoSource, {sourceName: 'ProtoSource'})` at runtime; re-registering the same name overwrites (idempotent, useful for hot-reload).

`aiConfig.useDefaultSources` (default `true`) controls whether Neo's 10 curated Source classes are also registered. A deployment indexing *only* tenant content sets it `false`; the registry then contains only the tenant's custom Sources. See [Configuration](./Configuration.md).

## Built-in Raw Repo Fallback

Use `rawRepoSource: true` when a tenant needs day-0 ingestion before its repository shape is known well enough to justify a custom Source. This registers `RawRepoSource`, which walks `aiConfig.sourcePaths.RawRepoSource.root` and emits one raw-text parsed chunk per included file. It is not part of Neo's 10 curated default Sources, so zero-config Neo syncs never walk the full repository implicitly. This is the full-corpus Source-build path (`kbSync` lane / `npm run ai:sync-kb`) — **not** pull mode: server-side pull-mode ingestion takes the whole git tree from the deployment mirror regardless of `sourcePaths`.

```js
rawRepoSource: true,
useDefaultSources: false,
sourcePaths: {
    RawRepoSource: {
        root             : '.',
        includeExtensions: ['.md', '.js', '.json'],
        excludePaths     : ['.git', 'node_modules', 'dist', 'docs/output'],
        excludeExtensions: ['.png', '.jpg', '.pdf', '.woff2']
    }
}
```

Graduate from `RawRepoSource` to a custom Source when a tenant needs semantic chunking, generated-manifest boundaries, or source-specific metadata.

## Path conventions

A Source should not hard-code its territory path. Resolve it from `aiConfig.sourcePaths` keyed by the Source's registry name — `aiConfig.sourcePaths.ProtoSource` — so a deployment whose layout differs overrides only that key. Defaults belong in `config.template.mjs`, not in consumer-side optional chains. Each Source interprets its own entry shape (a string, a string-array, or a path→type object — see the built-in Source defaults in `config.template.mjs`).

## Identity-tuple semantics

Every KB chunk is owned by the path-identity tuple `{tenantId, repoSlug, rootKind, sourcePath}` (see [`identity-tuple.md`](../../../ai/services/knowledge-base/parser/identity-tuple.md)). A custom Source does **not** set `tenantId` / `repoSlug` itself:

- `createHashFn` folds `tenantId` + `repoSlug` into the content hash automatically, so byte-identical content under two tenants produces distinct chunk ids.
- The write-side server stamp applies the authoritative tenant tuple at embed time — client/Source-supplied tenant fields are never authoritative.

Neo's own curated content resolves to `tenantId: 'neo-shared'`, `repoSlug: 'neo'`, `rootKind: 'neo-workspace'` — the team namespace visible to every tenant. A custom Source emits content; the substrate stamps the identity.

## Related

- [Overview](./Overview.md) — the Source/Parser registry split and the contract layering.
- [Custom Parsers](./CustomParsers.md) — the push-path counterpart; what most cloud tenants need.
- [Hook Wiring](./HookWiring.md) — the `ingest_source_files` / `ai:ingest-tenant` push facades.
- [Configuration](./Configuration.md) — `useDefaultSources`, `customSources`, `sourcePaths`.
- [`source/Base.mjs`](../../../ai/services/knowledge-base/source/Base.mjs) — the abstract Source contract · [`identity-tuple.md`](../../../ai/services/knowledge-base/parser/identity-tuple.md) — the chunk-identity tuple.
- [#11658](https://github.com/neomjs/neo/issues/11658) Phase 0/1B Source/Parser registry · [#11660](https://github.com/neomjs/neo/issues/11660) per-source path externalization.
