import {setup} from '../../../../setup.mjs';

const appName = 'AdrIngestorTest';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import fs             from 'fs';
import path           from 'path';
import os             from 'os';
import {TestLifecycleHelper} from '../../services/memory-core/util.mjs';

test.describe('Neo.ai.daemons.services.AdrIngestor', () => {
    let GraphService;
    let AdrIngestor;
    let logger;
    let SystemLifecycleService;

    let tmpRoot;
    let decisionsDir;
    let StorageRouter;
    let upsertedDocs = [];
    let embeddedStore = new Map();
    let _originalGetGraphCollection;

    let originalWarn;
    let warnMessages = [];

    test.beforeAll(async () => {
        const aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;

        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, {recursive: true});
        }
        aiConfig.autoIngestFileSystem = false;
        aiConfig.handoffFilePath      = path.join(tmpDir, 'mock_sandman_handoff_adr_ingestor.md');

        GraphService           = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        AdrIngestor            = (await import('../../../../../../ai/services/ingestion/AdrIngestor.mjs')).default;
        logger                 = (await import('../../../../../../ai/mcp/server/memory-core/logger.mjs')).default;
        SystemLifecycleService = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;
        StorageRouter          = (await import('../../../../../../ai/services.mjs')).Memory_StorageRouter;

        // Reactive provider SSOT: under UNIT_TEST_MODE the Memory Core config resolves
        // storagePaths.graph to `:memory:` by construction. Do not mutate the shared AiConfig
        // DB path; just clear singleton lifecycle/cache state before booting this spec.
        await TestLifecycleHelper.cleanupGraphService(GraphService, SystemLifecycleService, null, null, 'clear');

        if (!SystemLifecycleService._initPromise) {
            await SystemLifecycleService.initAsync();
        } else {
            await SystemLifecycleService.ready();
        }

        if (!GraphService.db) {
            GraphService._initPromise = null;
            await GraphService.initAsync();
        }
    });

    test.beforeEach(() => {
        tmpRoot      = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-adr-ingestor-test-'));
        decisionsDir = path.join(tmpRoot, 'learn/agentos/decisions');
        fs.mkdirSync(decisionsDir, {recursive: true});

        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();

            if (GraphService.db.storage?.db) {
                GraphService.db.storage.clear();
                GraphService.db.storage.db.exec('DELETE FROM GraphLog');
                GraphService.db.lastSyncId = 0;
            }
        }

        warnMessages = [];
        originalWarn = logger.warn;
        logger.warn  = (...args) => {
            warnMessages.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
        };

        // Stub the graph collection so the embed-write records documents WITHOUT invoking the
        // real embedder (which would otherwise embed every ADR and time the corpus ingest out).
        upsertedDocs                = [];
        _originalGetGraphCollection = StorageRouter.getGraphCollection;

        embeddedStore.clear();
        StorageRouter.getGraphCollection = async () => ({
            get   : async ({ids = []}) => {
                const out = {ids: [], metadatas: []};
                for (const id of ids) {
                    if (embeddedStore.has(id)) { out.ids.push(id); out.metadatas.push(embeddedStore.get(id)); }
                }
                return out;
            },
            upsert: async ({ids, documents, metadatas}) => {
                ids.forEach((id, i) => embeddedStore.set(id, metadatas[i]));
                upsertedDocs.push({ids, documents, metadatas});
            }
        });
    });

    test.afterEach(() => {
        if (originalWarn) logger.warn = originalWarn;
        if (_originalGetGraphCollection) StorageRouter.getGraphCollection = _originalGetGraphCollection;

        if (tmpRoot && fs.existsSync(tmpRoot)) {
            try { fs.rmSync(tmpRoot, {recursive: true}); } catch (e) {}
        }
    });

    test.afterAll(async () => {
        await TestLifecycleHelper.cleanupGraphService(GraphService, SystemLifecycleService, null, null, 'clear');
    });

    function writeAdr(fileName, body) {
        fs.writeFileSync(path.join(decisionsDir, fileName), body.trim() + '\n', 'utf8');
    }

    function syncOptions() {
        return {
            decisionsDir: 'learn/agentos/decisions',
            sourceRoot  : tmpRoot
        };
    }

    test('should upsert ADR nodes with normalized metadata and payload hashes', async () => {
        writeAdr('0099-test-decision.md', `
# ADR 0099: Test Decision Shape

| **Status** | Proposed - transitions to Accepted on merge |
| **Supersedes** | old decision; obsolete note |

Body.
        `);

        const stats = await AdrIngestor.syncAdrsToGraph(syncOptions());

        expect(stats.adrsProcessed).toBe(1);
        expect(stats.adrsUpserted).toBe(1);
        expect(stats.adrsSkipped).toBe(0);
        expect(stats.errors).toEqual([]);

        const node = GraphService.db.nodes.get('adr-0099');
        expect(node).toBeDefined();
        expect(node.label).toBe('ADR');
        expect(node.properties.title).toBe('Test Decision Shape');
        expect(node.properties.status).toBe('Draft');
        expect(node.properties.rawStatus).toBe('Proposed - transitions to Accepted on merge');
        expect(node.properties.adrNumber).toBe('0099');
        expect(node.properties.adrNumberValue).toBe(99);
        expect(node.properties.source).toBe('learn/agentos/decisions/0099-test-decision.md');
        expect(node.properties.supersedes).toEqual(['old decision', 'obsolete note']);
        expect(node.properties.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('should embed each ADR document into the graph collection (idempotent)', async () => {
        writeAdr('0099-test-decision.md', `
# ADR 0099: Test Decision Shape

| **Status** | Proposed |

Body content for embedding.
        `);

        await AdrIngestor.syncAdrsToGraph(syncOptions());

        // The ADR document is upserted into the graph collection → semantically queryable.
        const adrUpsert = upsertedDocs.find(u => u.ids[0] === 'adr-0099');
        expect(adrUpsert).toBeTruthy();
        expect(adrUpsert.documents[0]).toContain('Test Decision Shape');
        expect(adrUpsert.metadatas[0].type).toBe('ADR');
        expect(adrUpsert.metadatas[0].hash).toMatch(/^[a-f0-9]{32}$/); // md5 content hash

        // The SQLite node carries semanticVectorId → the node knows it is embedded (not detached).
        expect(GraphService.db.nodes.get('adr-0099').properties.semanticVectorId).toBe('adr-0099');

        // Idempotent: a re-sync of unchanged content (node + body) writes no new vector.
        upsertedDocs.length = 0;
        await AdrIngestor.syncAdrsToGraph(syncOptions());
        expect(upsertedDocs.find(u => u.ids[0] === 'adr-0099')).toBeFalsy();
    });

    test('should re-embed on a body-only edit even when payloadHash (metadata) is unchanged', async () => {
        writeAdr('0099-test-decision.md', `
# ADR 0099: Test Decision Shape

| **Status** | Proposed |

Original body.
        `);
        await AdrIngestor.syncAdrsToGraph(syncOptions());

        // Edit ONLY the body (title/status/metadata unchanged → payloadHash identical).
        upsertedDocs.length = 0;
        writeAdr('0099-test-decision.md', `
# ADR 0099: Test Decision Shape

| **Status** | Proposed |

Completely different body content.
        `);
        await AdrIngestor.syncAdrsToGraph(syncOptions());

        // The vector MUST update — the old guard skipped before the md5 check, stranding a stale vector.
        const reEmbed = upsertedDocs.find(u => u.ids[0] === 'adr-0099');
        expect(reEmbed).toBeTruthy();
        expect(reEmbed.documents[0]).toContain('different body content');
    });

    test('should emit only deterministic ADR 0006 edge taxonomy rows', async () => {
        writeAdr('0099-test-decision.md', `
# ADR 0099: Test Decision Shape

| **Status** | Accepted - 2026-06-14 |
| **Implementation ticket** | #456 |

## Related

- Ticket #456
- Issue #789
- Epic #1000
- PR #123
- Origin Session ID: \`agent-session-abc\`
- CONCEPT:mx-loop
        `);

        const stats = await AdrIngestor.syncAdrsToGraph(syncOptions());

        expect(stats.edgesReplaced).toBe(9);

        const edgeKeys = GraphService.db.edges.items
            .map(edge => `${edge.source}|${edge.target}|${edge.type}`)
            .sort();

        expect(edgeKeys).toEqual([
            'adr-0099|issue-1000|GOVERNS',
            'adr-0099|issue-456|GOVERNS',
            'adr-0099|issue-789|GOVERNS',
            'adr-0099|mx-loop|CODIFIES_CONCEPT',
            'adr-0099|session:agent-session-abc|GRADUATED_FROM',
            'issue-1000|adr-0099|CITES_AUTHORITY',
            'issue-456|adr-0099|CITES_AUTHORITY',
            'issue-789|adr-0099|CITES_AUTHORITY',
            'pr-123|adr-0099|IMPLEMENTS_DECISION'
        ].sort());

        expect(GraphService.db.nodes.get('issue-456').label).toBe('ISSUE');
        expect(GraphService.db.nodes.get('pr-123').label).toBe('PULL_REQUEST');
        expect(GraphService.db.nodes.get('session:agent-session-abc').label).toBe('SESSION');
        expect(GraphService.db.nodes.get('mx-loop').label).toBe('CONCEPT');
    });

    test('should skip unchanged ADRs via payload hash match', async () => {
        writeAdr('0099-test-decision.md', `
# ADR 0099: Test Decision Shape

| **Status** | Accepted - 2026-06-14 |

Ticket #456
        `);

        const first = await AdrIngestor.syncAdrsToGraph(syncOptions());
        const edgesAfterFirst = GraphService.db.edges.items.length;
        const second = await AdrIngestor.syncAdrsToGraph(syncOptions());

        expect(first.adrsUpserted).toBe(1);
        expect(second.adrsUpserted).toBe(0);
        expect(second.adrsSkipped).toBe(1);
        expect(second.edgesReplaced).toBe(0);
        expect(GraphService.db.edges.items.length).toBe(edgesAfterFirst);
    });

    test('should isolate malformed files as errors while ingesting valid ADRs', async () => {
        writeAdr('0099-valid.md', `
# ADR 0099: Valid

**Status**: Accepted
        `);
        writeAdr('not-an-adr.md', '# Ignored');

        const stats = await AdrIngestor.syncAdrsToGraph(syncOptions());

        expect(stats.adrsProcessed).toBe(1);
        expect(stats.adrsUpserted).toBe(1);
        expect(stats.errors).toEqual([]);
        expect(warnMessages).toEqual([]);
        expect(GraphService.db.nodes.get('adr-0099')).toBeDefined();
    });

    test('should ingest the current ADR corpus without parse errors', async () => {
        const
            repoRoot     = process.cwd(),
            repoAdrDir   = path.resolve(repoRoot, 'learn/agentos/decisions'),
            expectedAdrs = fs.readdirSync(repoAdrDir).filter(file => /^\d{4}-.*\.md$/.test(file)).length;

        const stats = await AdrIngestor.syncAdrsToGraph({
            decisionsDir: 'learn/agentos/decisions',
            sourceRoot  : repoRoot
        });

        expect(stats.adrsProcessed).toBe(expectedAdrs);
        expect(stats.errors).toEqual([]);
        expect(GraphService.db.nodes.items.filter(node => node.label === 'ADR').length).toBe(expectedAdrs);
    });
});
