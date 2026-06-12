import {setup} from '../../../../setup.mjs';

const appName = 'KBTenantIsolationTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}        from '@playwright/test';
import Neo                   from '../../../../../../src/Neo.mjs';
import * as core             from '../../../../../../src/core/_export.mjs';
import fs                    from 'fs-extra';
import os                    from 'os';
import path                  from 'path';
import RequestContextService from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';

/**
 * @summary Fail-closed tenant-isolation suite for the Knowledge Base read side.
 *
 * Covers the 8 fail-closed cases graduated from the tenant-isolation design discussion, parameterized over the
 * 5 public KB MCP facades. ChromaDB is replaced with an in-memory spy collection that locally
 * simulates the `where: {tenantId: {$in: [...]}}` filter, and `RequestContextService.run`
 * controls the server-side requester identity — no real SQLite / Chroma is touched.
 *
 * Cases 3 and 4 are write-side concerns (tenant-aware chunk-id derivation and write-side spoof
 * rejection). They are exhaustively covered by `VectorService.tenantStamping.spec.mjs`;
 * this suite re-anchors their security property against the `VectorService` primitives so all
 * 8 cases stay visible in one load-bearing place, without re-driving the `embed` pipeline.
 *
 * The 5 facades map 1:1 to service methods via `ai/mcp/server/knowledge-base/toolService.mjs`
 * `serviceMapping`; the case-8 block exercises each facade's implementation directly.
 *
 * Serial mode: the suite mutates singleton services and `aiConfig`.
 */
test.describe.configure({mode: 'serial'});

/**
 * Builds an in-memory ChromaDB stand-in. `query` / `get` apply the same `where` predicate
 * ChromaDB would, including the `$in` operator the tenant filter relies on.
 * @returns {Object}
 */
function createSpyCollection() {
    const rows  = new Map();
    const calls = {query: [], get: []};

    const matchesWhere = (metadata, where) => {
        if (!where) return true;
        if (Array.isArray(where.$and)) {
            return where.$and.every(clause => matchesWhere(metadata, clause));
        }
        return Object.entries(where).every(([key, cond]) => {
            if (cond && typeof cond === 'object' && Array.isArray(cond.$in)) {
                return cond.$in.includes(metadata?.[key]);
            }
            return metadata?.[key] === cond;
        });
    };

    return {
        rows,
        calls,
        name: 'spy-knowledge-base',

        /** Seeds a cache-resident chunk. */
        seed(id, metadata, document = '') {
            rows.set(id, {id, metadata, document});
            return this;
        },

        async query({queryEmbeddings, nResults, where} = {}) {
            calls.query.push({queryEmbeddings, nResults, where});

            const matched = Array.from(rows.values())
                .filter(row => matchesWhere(row.metadata, where))
                .slice(0, nResults);

            return {
                ids      : [matched.map(row => row.id)],
                distances: [matched.map(() => 0)],
                metadatas: [matched.map(row => row.metadata)],
                documents: [matched.map(row => row.document)]
            };
        },

        async get({ids, where, limit = 100, offset = 0} = {}) {
            calls.get.push({ids, where, limit, offset});

            let entries = ids
                ? ids.map(id => rows.get(id)).filter(Boolean)
                : Array.from(rows.values());

            entries = entries.filter(row => matchesWhere(row.metadata, where));

            if (!ids) {
                entries = entries.slice(offset, offset + limit);
            }

            return {
                ids      : entries.map(row => row.id),
                metadatas: entries.map(row => row.metadata),
                documents: entries.map(row => row.document)
            };
        }
    };
}

function hasTenantFilter(where, expected) {
    if (!where) {
        return false;
    }

    if (Array.isArray(where.$and)) {
        return where.$and.some(clause => hasTenantFilter(clause, expected));
    }

    return expected
        ? JSON.stringify(where.tenantId) === JSON.stringify({$in: expected})
        : Object.hasOwn(where, 'tenantId');
}

/**
 * Builds a knowledge-base chunk record. `inheritanceChain` is the JSON-string shape
 * `QueryService.queryDocuments` expects (it `JSON.parse`s the field).
 * @returns {{id: String, metadata: Object}}
 */
function chunk({id, tenantId, source, name, type = 'guide', content, repoSlug}) {
    const metadata = {tenantId, source, name, type, inheritanceChain: '[]'};

    if (content) {
        metadata.content = content;
    }

    if (repoSlug) {
        metadata.repoSlug = repoSlug;
    }

    return {
        id,
        metadata
    };
}

test.describe('KnowledgeBase — fail-closed tenant isolation (#11632)', () => {
    let ChromaManager, DocumentService, QueryService, SearchService, VectorService;
    let TextEmbeddingService, aiConfig;
    let originalGetCollection, originalEmbedText, originalModel, originalDefaultTenantId;
    let spy;

    // Canonical fixtures: a chunk owned by tenant-a, a private chunk owned by tenant-b, and a
    // curated chunk in the cross-tenant `neo-shared` namespace.
    const OWN = chunk({
        id      : 'c-own',
        tenantId: 'tenant-a',
        repoSlug: 'tenant-app',
        source  : 'kb/tenant-a/Own.md',
        name    : 'Own',
        content : 'TENANT_A_VISIBLE_CONTENT'
    });
    const FOREIGN = chunk({
        id      : 'c-foreign',
        tenantId: 'tenant-b',
        repoSlug: 'tenant-app',
        source  : 'kb/tenant-b/Secret.md',
        name    : 'Secret',
        content : 'TENANT_B_SECRET_CONTENT'
    });
    const SHARED = chunk({
        id      : 'c-shared',
        tenantId: 'neo-shared',
        repoSlug: 'neo',
        source  : 'kb/neo-shared/Curated.md',
        name    : 'Curated'
    });

    test.beforeAll(async () => {
        ChromaManager        = (await import('../../../../../../ai/services/knowledge-base/ChromaManager.mjs')).default;
        DocumentService      = (await import('../../../../../../ai/services/knowledge-base/DocumentService.mjs')).default;
        QueryService         = (await import('../../../../../../ai/services/knowledge-base/QueryService.mjs')).default;
        SearchService        = (await import('../../../../../../ai/services/knowledge-base/SearchService.mjs')).default;
        VectorService        = (await import('../../../../../../ai/services/knowledge-base/VectorService.mjs')).default;
        TextEmbeddingService = (await import('../../../../../../ai/services/memory-core/TextEmbeddingService.mjs')).default;
        aiConfig             = (await import('../../../../../../ai/mcp/server/knowledge-base/config.mjs')).default;

        originalGetCollection   = ChromaManager.getKnowledgeBaseCollection;
        originalEmbedText       = TextEmbeddingService.embedText;
        originalModel           = SearchService.model;
        originalDefaultTenantId = aiConfig.defaultTenantId;
    });

    test.beforeEach(() => {
        spy = createSpyCollection();
        [OWN, FOREIGN, SHARED].forEach(c => spy.seed(c.id, c.metadata));

        ChromaManager.getKnowledgeBaseCollection = async () => spy;
        TextEmbeddingService.embedText           = async () => [0.1, 0.2, 0.3];
        SearchService.model                      = {
            generateContent: async () => ({response: {text: () => 'stub-synthesis'}})
        };
        // A local operator overlay may predate the tenant keys — pin the value so the
        // suite is deterministic regardless of local config staleness.
        aiConfig.defaultTenantId = 'neo-shared';
    });

    test.afterEach(() => {
        ChromaManager.getKnowledgeBaseCollection = originalGetCollection;
        TextEmbeddingService.embedText           = originalEmbedText;
        SearchService.model                      = originalModel;
        aiConfig.defaultTenantId                 = originalDefaultTenantId;
    });

    test('no request context → no tenant filter (single-tenant fallthrough, pre-#11632 behavior)', async () => {
        const result = await QueryService.queryDocuments({query: 'anything', type: 'all'});

        // Every seeded chunk is returned and the query carries no tenantId predicate.
        const sources = result.results.map(r => r.source);
        expect(sources).toEqual(expect.arrayContaining([
            OWN.metadata.source, FOREIGN.metadata.source, SHARED.metadata.source
        ]));
        expect(spy.calls.query.every(call => !hasTenantFilter(call.where))).toBe(true);
    });

    test('case 1 — tenant isolation: query_documents hides another tenant\'s private chunks', async () => {
        const result = await RequestContextService.run({userId: 'tenant-a'}, () =>
            QueryService.queryDocuments({query: 'anything', type: 'all'})
        );

        const sources = result.results.map(r => r.source);
        expect(sources).toContain(OWN.metadata.source);
        expect(sources).not.toContain(FOREIGN.metadata.source);

        // The filter is server-derived and carries exactly the requester plus the team namespace.
        expect(spy.calls.query.every(call => hasTenantFilter(call.where, ['tenant-a', 'neo-shared']))).toBe(true);
    });

    test('case 2 — team visibility: neo-shared chunks stay visible across every tenant', async () => {
        const asTenantA = await RequestContextService.run({userId: 'tenant-a'}, () =>
            QueryService.queryDocuments({query: 'anything', type: 'all'})
        );
        const asTenantB = await RequestContextService.run({userId: 'tenant-b'}, () =>
            QueryService.queryDocuments({query: 'anything', type: 'all'})
        );

        expect(asTenantA.results.map(r => r.source)).toContain(SHARED.metadata.source);
        expect(asTenantB.results.map(r => r.source)).toContain(SHARED.metadata.source);
    });

    test('case 3 — chunk-shadow: identical content under two tenants yields distinct chunk ids', () => {
        // Write-side anchor — full coverage in VectorService.tenantStamping.spec.mjs.
        const content = {hash: 'identical-content-hash', type: 'guide', name: 'Doc', source: 'shared/Doc.md'};

        const idA = VectorService.createTenantAwareChunkId(content, {tenantId: 'tenant-a', repoSlug: 'repo'});
        const idB = VectorService.createTenantAwareChunkId(content, {tenantId: 'tenant-b', repoSlug: 'repo'});

        expect(idA).toHaveLength(64);
        expect(idA).not.toBe(idB);
    });

    test('case 4 — write-side spoof: a forged client tenantId is rejected in reject mode', () => {
        // Write-side anchor — full coverage in VectorService.tenantStamping.spec.mjs.
        const originalMode = aiConfig.spoofRejectionMode;
        aiConfig.spoofRejectionMode = 'reject';

        try {
            const forged      = {hash: 'h', type: 'guide', name: 'Doc', source: 's', tenantId: 'tenant-victim'};
            const serverStamp = {tenantId: 'tenant-attacker', repoSlug: 'repo', visibility: 'team'};

            expect(() => VectorService.validateTenantStamp(forged, serverStamp, 'chunk-id'))
                .toThrow(/KB_TENANT_SPOOF_REJECTED/);
        } finally {
            aiConfig.spoofRejectionMode = originalMode;
        }
    });

    test('case 5 — read-side spoof: a forged client tenantId query argument is ignored', async () => {
        // tenant-a passes a forged `tenantId: 'tenant-b'` query argument, attempting to pivot the
        // read filter onto tenant-b's corpus. The argument is inert — the filter is derived from
        // the server-side request context only (DocumentService behaves identically).
        const result = await RequestContextService.run({userId: 'tenant-a'}, () =>
            QueryService.queryDocuments({query: 'anything', type: 'all', tenantId: 'tenant-b'})
        );

        expect(spy.calls.query.every(call => hasTenantFilter(call.where, ['tenant-a', 'neo-shared']))).toBe(true);
        expect(result.results.map(r => r.source)).not.toContain(FOREIGN.metadata.source);
    });

    test('case 6 — backup-record path isolation: a restored foreign chunk still obeys the read filter', async () => {
        // manageDatabaseBackup({action: 'import'}) restores records verbatim — it bypasses
        // ingestion validation by design (to preserve embeddings) but does NOT bypass tenant
        // metadata. The read filter is metadata-driven, so a restored foreign-tenant chunk is
        // still fail-closed. Modelled here as a cache-resident chunk carrying a foreign tenantId.
        spy.seed('c-restored', {
            tenantId: 'tenant-b', source: 'kb/tenant-b/Restored.md', name: 'Restored',
            type    : 'guide',    inheritanceChain: '[]'
        });

        const result = await RequestContextService.run({userId: 'tenant-a'}, () =>
            QueryService.queryDocuments({query: 'anything', type: 'all'})
        );

        expect(result.results.map(r => r.source)).not.toContain('kb/tenant-b/Restored.md');
    });

    test('case 7 — search hydration is tenant-aware: ask never surfaces a foreign tenant\'s source', async () => {
        const result = await RequestContextService.run({userId: 'tenant-a'}, () =>
            SearchService.ask({query: 'anything', type: 'all'})
        );

        // References derive from the tenant-filtered retrieval, so a foreign chunk is dropped
        // before SearchService would ever resolve/hydrate its source path.
        const refSources = result.references.map(r => r.source);
        expect(refSources).toContain(SHARED.metadata.source);
        expect(refSources).not.toContain(FOREIGN.metadata.source);
    });

    test('case 7b — search hydration feeds tenant-owned metadata content to synthesis', async () => {
        let capturedPrompt = null;

        SearchService.model = {
            generateContent: async (prompt) => {
                capturedPrompt = prompt;
                return {response: {text: () => 'stub-synthesis'}};
            }
        };

        const result = await RequestContextService.run({userId: 'tenant-a'}, () =>
            SearchService.ask({query: 'anything', type: 'all'})
        );

        expect(result.references.map(r => r.source)).toContain(OWN.metadata.source);
        expect(capturedPrompt).toContain('TENANT_A_VISIBLE_CONTENT');
        expect(capturedPrompt).not.toContain('TENANT_B_SECRET_CONTENT');
    });

    test.describe('case 8 — every public KB facade respects the tenant boundary', () => {
        test('query_documents (QueryService.queryDocuments)', async () => {
            const result = await RequestContextService.run({userId: 'tenant-a'}, () =>
                QueryService.queryDocuments({query: 'anything', type: 'all'})
            );
            expect(result.results.map(r => r.source)).not.toContain(FOREIGN.metadata.source);
        });

        test('ask_knowledge_base (SearchService.ask)', async () => {
            const result = await RequestContextService.run({userId: 'tenant-a'}, () =>
                SearchService.ask({query: 'anything', type: 'all'})
            );
            expect(result.references.map(r => r.source)).not.toContain(FOREIGN.metadata.source);
        });

        test('list_documents (DocumentService.listDocuments)', async () => {
            const result = await RequestContextService.run({userId: 'tenant-a'}, () =>
                DocumentService.listDocuments({limit: 100})
            );

            const ids = result.documents.map(d => d.id);
            expect(ids).toContain(OWN.id);
            expect(ids).toContain(SHARED.id);
            expect(ids).not.toContain(FOREIGN.id);
            expect(spy.calls.get.at(-1).where).toEqual({tenantId: {$in: ['tenant-a', 'neo-shared']}});
        });

        test('get_document_by_id (DocumentService.getDocumentById) — a foreign id is not found', async () => {
            const own = await RequestContextService.run({userId: 'tenant-a'}, () =>
                DocumentService.getDocumentById({id: OWN.id})
            );
            expect(own.id).toBe(OWN.id);

            // A cross-tenant id fails closed — the error is indistinguishable from a genuinely
            // absent id, so no existence signal leaks.
            await expect(RequestContextService.run({userId: 'tenant-a'}, () =>
                DocumentService.getDocumentById({id: FOREIGN.id})
            )).rejects.toThrow(`Document with id '${FOREIGN.id}' not found.`);
        });

        test('get_class_hierarchy (QueryService.getClassHierarchy) — static, never queries the tenant collection', async () => {
            const tmpHierarchy = path.join(os.tmpdir(), `kb-tenant-hierarchy-${process.pid}-${Date.now()}.json`);
            await fs.writeJson(tmpHierarchy, {
                'Neo.component.Base': 'Neo.core.Base',
                'Neo.button.Base'   : 'Neo.component.Base'
            });
            const originalHierarchyPath = aiConfig.hierarchyPath;
            aiConfig.hierarchyPath = tmpHierarchy;

            try {
                const asTenantA = await RequestContextService.run({userId: 'tenant-a'}, () =>
                    QueryService.getClassHierarchy({root: 'Neo.component.Base'})
                );
                const asTenantB = await RequestContextService.run({userId: 'tenant-b'}, () =>
                    QueryService.getClassHierarchy({root: 'Neo.component.Base'})
                );

                // The class graph is Neo's own framework structure — shared-by-design and
                // tenant-independent — and the facade never consults the Chroma collection,
                // so it structurally cannot leak tenant-scoped chunks.
                expect(asTenantA).toEqual(asTenantB);
                expect(asTenantA['Neo.button.Base']).toBe('Neo.component.Base');
                expect(spy.calls.query).toHaveLength(0);
                expect(spy.calls.get).toHaveLength(0);
            } finally {
                aiConfig.hierarchyPath = originalHierarchyPath;
                await fs.remove(tmpHierarchy).catch(() => {});
            }
        });
    });
});
