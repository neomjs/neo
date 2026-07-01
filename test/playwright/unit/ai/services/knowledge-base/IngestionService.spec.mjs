import {setup} from '../../../../setup.mjs';

const appName = 'IngestionServiceTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
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
import fs             from 'fs-extra';
import aiConfig       from '../../../../../../ai/mcp/server/knowledge-base/config.mjs';

/**
 * Contract coverage for IngestionService.
 *
 * The suite uses mock VectorService / Chroma / telemetry dependencies so it verifies the
 * Phase 2A orchestration contract without touching the real ChromaDB collection or external
 * embedding provider.
 */
test.describe.configure({mode: 'serial'});

function validParsedChunk(overrides = {}) {
    return {
        schemaVersion: '1.0.0',
        tenantId     : 'tenant-a',
        repoSlug     : 'repo-a',
        rootKind     : 'bare-repo',
        sourcePath   : 'src/index.js',
        content      : 'export const value = 1;',
        hashInputs   : ['kind', 'name', 'content', 'sourcePath', 'parserId', 'parserVersion'],
        parserId     : 'client-parser',
        parserVersion: '1.0.0',
        kind         : 'module-context',
        name         : 'src/index.js - [Module]',
        ...overrides
    };
}

function createSpyCollection(rows = []) {
    const state = new Map(rows.map(row => [row.id, row]));

    return {
        state,
        name: 'spy-knowledge-base',

        async get({where, limit = 2000, offset = 0, include = []} = {}) {
            const all = Array.from(state.values())
                .filter(row => !where?.tenantId || row.metadata.tenantId === where.tenantId);
            const slice = all.slice(offset, offset + limit);

            return {
                ids      : slice.map(row => row.id),
                metadatas: include.includes('metadatas') ? slice.map(row => row.metadata) : []
            };
        },

        async delete({ids}) {
            ids.forEach(id => state.delete(id));
        }
    };
}

/**
 * Minimal in-memory stub of the GraphService surface consumed by tenant config / manifest APIs.
 * @returns {Object}
 */
function createGraphStub() {
    const store = new Map();

    return {
        store,
        async initAsync() {},
        getNodeRecord({id}) {
            return store.has(id) ? {...store.get(id)} : null;
        },
        listNodeRecordsByType({type, idPrefix}) {
            const records = [...store.values()]
                .filter(record => record.type === type && (!idPrefix || record.id.startsWith(idPrefix)))
                .map(record => ({...record, properties: {...record.properties}}));

            return {records};
        },
        async upsertNode({id, type, properties}) {
            store.set(id, {id, type, properties: {...properties}});
        }
    };
}

function createEmbeddingGuardrail(overrides = {}) {
    return {
        enabled                  : true,
        embeddingProvider        : 'openAiCompatible',
        contextLimitTokens       : 100,
        safeProcessingLimitTokens: 80,
        model                    : 'unit-test-embedding-model',
        ...overrides
    };
}

test.describe('IngestionService.ingestSourceFiles', () => {
    let Service;
    let originals;
    let vectorCalls;
    let metrics;
    let collection;

    test.beforeAll(async () => {
        Service = (await import('../../../../../../ai/services/knowledge-base/IngestionService.mjs')).default;
    });

    test.beforeEach(() => {
        vectorCalls = [];
        metrics     = [];
        collection  = createSpyCollection();

        originals = {
            chromaManager                 : Service.chromaManager,
            activeIngestionProgress       : Service.activeIngestionProgress,
            graphService                  : Service.graphService,
            getTenantConfig               : Service.getTenantConfig,
            lastIngestionProgress         : Service.lastIngestionProgress,
            recorderService               : Service.recorderService,
            requestContextService         : Service.requestContextService,
            resolveEmbeddingInputGuardrail: Service.resolveEmbeddingInputGuardrail,
            revisionResolver              : Service.revisionResolver,
            sourceRegistry                : Service.sourceRegistry,
            vectorService                 : Service.vectorService
        };

        Service.chromaManager = {
            getKnowledgeBaseCollection: async () => collection
        };
        Service.graphService = createGraphStub();
        // ingestSourceFiles resolves the tenant-config version for chunk stamping;
        // stubbed here so this suite stays focused on ingestion orchestration.
        Service.getTenantConfig = async () => ({version: 0});
        Service.recorderService = {
            recordIngestionMetric: entry => metrics.push(entry)
        };
        Service.requestContextService = {
            getAgentIdentityNodeId: () => '@neo-gpt',
            getUserId             : () => 'tenant-a'
        };
        Service.revisionResolver = null;
        Service.sourceRegistry = {
            getParserIds: () => [],
            getParsers  : () => []
        };
        Service.vectorService = {
            splitOversizedEmbeddingChunk: originals.vectorService.splitOversizedEmbeddingChunk.bind(originals.vectorService),
            embed                       : async (filePath, options) => {
                const lines = (await fs.readFile(filePath, 'utf8')).trim().split('\n').filter(Boolean);
                vectorCalls.push({filePath, options, records: lines.map(line => JSON.parse(line))});
                return {message: 'Embedding complete. Collection now contains 1 items.', embedded: lines.length, deleted: 0};
            }
        };
        Service.activeIngestionProgress = null;
        Service.lastIngestionProgress   = null;
    });

    test.afterEach(() => {
        Object.assign(Service, originals);
    });

    test('validates parsed-chunk-v1 records, routes them to VectorService, and records telemetry', async () => {
        const summary = await Service.ingestSourceFiles({
            tenantId: 'tenant-a',
            files   : [{parsedChunks: [validParsedChunk()]}]
        });

        expect(summary.tenantId).toBe('tenant-a');
        expect(summary.ingested).toBe(1);
        expect(summary.embeddingsGenerated).toBe(1);
        expect(summary.deleted).toBe(0);
        expect(summary.errors).toEqual([]);
        expect(vectorCalls).toHaveLength(1);
        expect(vectorCalls[0].options.deleteStale).toBe(false);
        expect(vectorCalls[0].options.tenantContext).toMatchObject({
            tenantId           : 'tenant-a',
            repoSlug           : 'repo-a',
            visibility         : 'team',
            originAgentIdentity: '@neo-gpt'
        });
        expect(vectorCalls[0].records[0]).toMatchObject({
            source    : 'src/index.js',
            sourcePath: 'src/index.js',
            type      : 'module-context'
        });
        expect(vectorCalls[0].records[0].hash).toHaveLength(64);
        expect(metrics[0]).toMatchObject({
            tenantId      : 'tenant-a',
            repoSlug      : 'repo-a',
            eventType     : 'ingest',
            chunksTotal   : 1,
            chunksEmbedded: 1
        });
    });

    test('reports idle ingestion progress before any observed run (#14028)', () => {
        expect(Service.getIngestionProgress()).toMatchObject({
            status        : 'idle',
            active        : false,
            phase         : 'idle',
            stalled       : false,
            totalSources  : 0,
            seenSources   : 0,
            totalChunks   : 0,
            embeddedChunks: 0,
            skippedChunks : 0,
            remaining     : 0,
            lastRunSummary: null
        });
    });

    test('reports active ingestion progress and preserves the last-run summary (#14028)', async () => {
        let activeSnapshot;
        let releaseEmbed;
        const embedGate = new Promise(resolve => { releaseEmbed = resolve; });

        Service.vectorService.embed = async (filePath, options) => {
            const lines = (await fs.readFile(filePath, 'utf8')).trim().split('\n').filter(Boolean);
            vectorCalls.push({filePath, options, records: lines.map(line => JSON.parse(line))});
            activeSnapshot = Service.getIngestionProgress({staleAfterMs: 60000});
            await embedGate;
            return {message: 'Embedding complete.', embedded: lines.length, deleted: 0};
        };

        const ingestPromise = Service.ingestSourceFiles({
            tenantId: 'tenant-a',
            files   : [{parsedChunks: [validParsedChunk()]}]
        });

        while (!activeSnapshot) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        expect(activeSnapshot).toMatchObject({
            status        : 'running',
            active        : true,
            phase         : 'embedding',
            stalled       : false,
            totalSources  : 1,
            seenSources   : 1,
            totalChunks   : 1,
            embeddedChunks: 0,
            skippedChunks : 0,
            remaining     : 1
        });

        releaseEmbed();

        const summary = await ingestPromise;
        expect(summary.embeddingsGenerated).toBe(1);

        const idle = Service.getIngestionProgress();
        expect(idle).toMatchObject({
            status: 'idle',
            active: false,
            phase : 'idle'
        });
        expect(idle.lastRunSummary).toMatchObject({
            status        : 'completed',
            active        : false,
            totalSources  : 1,
            seenSources   : 1,
            totalChunks   : 1,
            embeddedChunks: 1,
            remaining     : 0
        });
    });

    test('marks active progress stalled when the last progress timestamp exceeds the threshold (#14028)', () => {
        const now = Date.now();

        Service.activeIngestionProgress = {
            status          : 'running',
            phase           : 'embedding',
            startedAt       : now - 1000,
            updatedAt       : now - 1000,
            lastProgressAt  : now - 1000,
            completedAt     : null,
            tenantId        : 'tenant-a',
            repoSlug        : 'repo-a',
            totalSources    : 1,
            seenSources     : 1,
            totalChunks     : 2,
            embeddableChunks: 2,
            embeddedChunks  : 1,
            skippedChunks   : 0,
            deletedRows     : 0,
            errorCount      : 0
        };

        const snapshot = Service.getIngestionProgress({staleAfterMs: 1});

        expect(snapshot).toMatchObject({
            status   : 'running',
            active   : true,
            phase    : 'embedding',
            stalled  : true,
            remaining: 1
        });
    });

    test('rejects parsed-chunk-v1 records carrying embedding and routes caller to restore path', async () => {
        const summary = await Service.ingestSourceFiles({
            tenantId: 'tenant-a',
            files   : [{parsedChunks: [{...validParsedChunk(), embedding: [0.1, 0.2]}]}]
        });

        expect(summary.ingested).toBe(0);
        expect(summary.embeddingsGenerated).toBe(0);
        expect(vectorCalls).toHaveLength(0);
        expect(summary.errors[0]).toMatchObject({
            code: 'KB_PARSED_CHUNK_EMBEDDING_REJECTED'
        });
        expect(summary.errors[0].message).toContain('manageDatabaseBackup');
        expect(metrics[0].eventType).toBe('error');
    });

    test('returns a structured tenant-mismatch error instead of throwing', async () => {
        const summary = await Service.ingestSourceFiles({
            tenantId: 'tenant-b',
            files   : [{parsedChunks: [validParsedChunk({tenantId: 'tenant-b'})]}]
        });

        expect(summary.ingested).toBe(0);
        expect(summary.errors[0]).toMatchObject({
            code: 'KB_INGEST_TENANT_MISMATCH'
        });
        expect(vectorCalls).toHaveLength(0);
    });

    test('returns structured caller errors for invalid file payloads and missing parsers', async () => {
        const invalidFilesSummary = await Service.ingestSourceFiles({
            tenantId: 'tenant-a',
            files   : 'not-an-array'
        });

        expect(invalidFilesSummary.ingested).toBe(0);
        expect(invalidFilesSummary.errors[0]).toMatchObject({
            code: 'KB_INGEST_FILES_INVALID'
        });
        expect(metrics[0].eventType).toBe('error');

        metrics = [];

        const missingParserSummary = await Service.ingestSourceFiles({
            tenantId: 'tenant-a',
            files   : [{
                content   : '# Missing parser',
                parserId  : 'missing-parser',
                sourcePath: 'docs/missing.md'
            }]
        });

        expect(missingParserSummary.ingested).toBe(0);
        expect(missingParserSummary.errors[0]).toMatchObject({
            code: 'KB_PARSER_NOT_REGISTERED'
        });
        expect(vectorCalls).toHaveLength(0);
        expect(metrics[0].eventType).toBe('error');
    });

    test('treats null baseRevision as first-sync (no boundary, no error)', async () => {
        const summary = await Service.ingestSourceFiles({
            tenantId    : 'tenant-a',
            repoSlug    : 'repo-a',
            files       : [],
            baseRevision: null,
            headRevision: 'head'
        });

        expect(summary.errors.some(e => e.code === 'KB_REVISION_BOUNDARY_INVALID')).toBe(false);
        expect(summary.errors.some(e => e.code === 'KB_REVISION_BOUNDARY_UNAVAILABLE')).toBe(false);
        expect(metrics[0]?.eventType).not.toBe('error');
    });

    test('rejects baseRevision-set with null headRevision via the new error message', async () => {
        const summary = await Service.ingestSourceFiles({
            tenantId    : 'tenant-a',
            repoSlug    : 'repo-a',
            files       : [],
            baseRevision: 'base',
            headRevision: null
        });

        expect(summary.errors[0]).toMatchObject({
            code   : 'KB_REVISION_BOUNDARY_INVALID',
            message: '`headRevision` is required when `baseRevision` is provided.'
        });
    });

    test('reports unavailable revision-boundary deletion resolver without throwing', async () => {
        const summary = await Service.ingestSourceFiles({
            tenantId    : 'tenant-a',
            repoSlug    : 'repo-a',
            files       : [],
            baseRevision: 'base',
            headRevision: 'head'
        });

        expect(summary.deleted).toBe(0);
        expect(summary.errors[0]).toMatchObject({
            code: 'KB_REVISION_BOUNDARY_UNAVAILABLE'
        });
        expect(metrics[0]).toMatchObject({
            eventType    : 'error',
            chunksDeleted: 0
        });
    });

    test('applies tombstone, manifest, and mock revision-boundary deletion signaling', async () => {
        collection = createSpyCollection([
            {id: 'keep', metadata: {tenantId: 'tenant-a', repoSlug: 'repo-a', sourcePath: 'src/live.js'}},
            {id: 'tombstone', metadata: {tenantId: 'tenant-a', repoSlug: 'repo-a', sourcePath: 'src/delete-me.js'}},
            {id: 'manifest-orphan', metadata: {tenantId: 'tenant-a', repoSlug: 'repo-a', sourcePath: 'src/orphan.js'}},
            {id: 'revision-delete', metadata: {tenantId: 'tenant-a', repoSlug: 'repo-a', sourcePath: 'src/revision.js'}},
            {id: 'other-tenant', metadata: {tenantId: 'tenant-b', repoSlug: 'repo-a', sourcePath: 'src/delete-me.js'}}
        ]);
        Service.chromaManager = {
            getKnowledgeBaseCollection: async () => collection
        };
        Service.revisionResolver = {
            resolveDeletedPaths: async () => [{repoSlug: 'repo-a', sourcePath: 'src/revision.js'}]
        };

        const summary = await Service.ingestSourceFiles({
            tenantId        : 'tenant-a',
            repoSlug        : 'repo-a',
            files           : [],
            deleted         : [{sourcePath: 'src/delete-me.js'}],
            manifestSnapshot: {repoSlug: 'repo-a', pathsAfterPush: ['src/live.js', 'src/revision.js']},
            baseRevision    : 'base',
            headRevision    : 'head'
        });

        expect(summary.deleted).toBe(3);
        expect(Array.from(collection.state.keys()).sort()).toEqual(['keep', 'other-tenant']);
        expect(metrics[0]).toMatchObject({
            eventType    : 'tombstone',
            chunksDeleted: 3
        });
    });

    test('records reconcile telemetry when one push ingests and deletes chunks', async () => {
        collection = createSpyCollection([
            {id: 'deleted', metadata: {tenantId: 'tenant-a', repoSlug: 'repo-a', sourcePath: 'src/deleted.js'}}
        ]);
        Service.chromaManager = {
            getKnowledgeBaseCollection: async () => collection
        };

        const summary = await Service.ingestSourceFiles({
            tenantId: 'tenant-a',
            repoSlug: 'repo-a',
            files   : [{parsedChunks: [validParsedChunk({sourcePath: 'src/new.js'})]}],
            deleted : [{sourcePath: 'src/deleted.js'}]
        });

        expect(summary.ingested).toBe(1);
        expect(summary.deleted).toBe(1);
        expect(metrics[0]).toMatchObject({
            eventType     : 'reconcile',
            chunksEmbedded: 1,
            chunksDeleted : 1
        });
    });

    test('server-side raw parsing consumes registered parsers and normalizes legacy chunks', async () => {
        const parser = {
            parse: content => [{
                content,
                kind      : 'doc-section',
                line_start: 1,
                line_end  : 1,
                name      : 'docs/readme.md - Intro',
                source    : 'docs/readme.md'
            }]
        };

        Service.sourceRegistry = {
            getParserIds: () => ['mock-parser'],
            getParsers  : () => [parser]
        };

        const summary = await Service.ingestSourceFiles({
            tenantId: 'tenant-a',
            repoSlug: 'repo-a',
            files   : [{
                content      : '# Intro',
                parserId     : 'mock-parser',
                parserVersion: '1.2.3',
                rootKind     : 'external-source',
                sourcePath   : 'docs/readme.md'
            }]
        });

        expect(summary.ingested).toBe(1);
        expect(summary.errors).toEqual([]);
        expect(vectorCalls[0].records[0]).toMatchObject({
            parserId     : 'mock-parser',
            parserVersion: '1.2.3',
            sourcePath   : 'docs/readme.md',
            type         : 'doc-section'
        });
    });

    test('splits over-budget client parsed chunks while embedding safe chunks', async () => {
        Service.resolveEmbeddingInputGuardrail = () => createEmbeddingGuardrail();
        const monsterContent = Array.from({length: 12}, (_, index) => `line-${index} ${'x'.repeat(24)}`).join('\n');

        const summary = await Service.ingestSourceFiles({
            tenantId: 'tenant-a',
            files   : [{parsedChunks: [
                validParsedChunk({sourcePath: 'src/safe.js', content: 'short payload'}),
                validParsedChunk({sourcePath: 'src/monster.js', content: monsterContent})
            ]}]
        });

        expect(summary.ingested).toBeGreaterThan(1);
        expect(summary.embeddingsGenerated).toBe(summary.ingested);
        expect(summary.skippedOversized).toBe(0);
        expect(summary.errors).toEqual([]);
        expect(vectorCalls).toHaveLength(1);
        expect(vectorCalls[0].records[0].sourcePath).toBe('src/safe.js');

        const splitRecords = vectorCalls[0].records.filter(record => record.sourcePath === 'src/monster.js');

        expect(splitRecords.length).toBeGreaterThan(1);
        expect(splitRecords.map(record => record.oversizedSplitIndex)).toEqual(splitRecords.map((_, index) => index));
        expect(splitRecords.every(record => record.oversizedSplit === true)).toBe(true);
        expect(splitRecords.every(record => record.oversizedSplitTotal === splitRecords.length)).toBe(true);
        expect(new Set(splitRecords.map(record => record.id)).size).toBe(splitRecords.length);
        expect(metrics[0]).toMatchObject({
            eventType     : 'ingest',
            chunksTotal   : summary.ingested,
            chunksEmbedded: summary.ingested
        });

        const firstIds = splitRecords.map(record => record.id);
        vectorCalls = [];
        metrics     = [];

        await Service.ingestSourceFiles({
            tenantId: 'tenant-a',
            files   : [{parsedChunks: [validParsedChunk({sourcePath: 'src/monster.js', content: monsterContent})]}]
        });

        expect(vectorCalls[0].records.map(record => record.id)).toEqual(firstIds);
    });

    test('splits over-budget raw fallback files before VectorService receives a temp JSONL', async () => {
        Service.resolveEmbeddingInputGuardrail = () => createEmbeddingGuardrail();

        const summary = await Service.ingestSourceFiles({
            tenantId: 'tenant-a',
            repoSlug: 'repo-a',
            files   : [{
                content   : Array.from({length: 12}, (_, index) => `section-${index} ${'y'.repeat(24)}`).join('\n'),
                sourcePath: 'docs/monster.md'
            }]
        });

        expect(summary.ingested).toBeGreaterThan(1);
        expect(summary.embeddingsGenerated).toBe(summary.ingested);
        expect(summary.skippedOversized).toBe(0);
        expect(summary.errors).toEqual([]);
        expect(vectorCalls).toHaveLength(1);
        expect(vectorCalls[0].records.length).toBe(summary.ingested);
        expect(vectorCalls[0].records.every(record => record.sourcePath === 'docs/monster.md')).toBe(true);
        expect(vectorCalls[0].records.every(record => record.parserId === 'raw-text')).toBe(true);
        expect(vectorCalls[0].records.every(record => record.oversizedSplit === true)).toBe(true);
        expect(metrics[0]).toMatchObject({
            eventType     : 'ingest',
            chunksTotal   : summary.ingested,
            chunksEmbedded: summary.ingested
        });
    });

    test('keeps skip diagnostics for over-budget chunks that cannot be split', async () => {
        Service.resolveEmbeddingInputGuardrail = () => createEmbeddingGuardrail({
            contextLimitTokens       : 50,
            safeProcessingLimitTokens: 40
        });

        const summary = await Service.ingestSourceFiles({
            tenantId: 'tenant-a',
            files   : [{parsedChunks: [validParsedChunk({
                content   : '',
                name      : 'x'.repeat(300),
                sourcePath: 'src/metadata-only.js'
            })]}]
        });

        expect(summary.ingested).toBe(0);
        expect(summary.embeddingsGenerated).toBe(0);
        expect(summary.skippedOversized).toBe(1);
        expect(summary.errors[0]).toMatchObject({
            code   : 'KB_INGEST_INPUT_SIZE_EXCEEDED',
            details: {
                sourcePath       : 'src/metadata-only.js',
                parserId         : 'client-parser',
                embeddingProvider: 'openAiCompatible'
            }
        });
        expect(summary.errors[0].details).not.toHaveProperty('content');
        expect(vectorCalls).toHaveLength(0);

        const idle = Service.getIngestionProgress();

        expect(idle.lastRunSummary).toMatchObject({
            status        : 'completed_with_errors',
            totalChunks   : 1,
            embeddedChunks: 0,
            skippedChunks : 1,
            remaining     : 0
        });
    });

    test('does not apply local embedding caps to non-local ingestion providers', async () => {
        Service.resolveEmbeddingInputGuardrail = () => createEmbeddingGuardrail({
            enabled                  : false,
            embeddingProvider        : 'gemini',
            contextLimitTokens       : 50,
            safeProcessingLimitTokens: 1,
            model                    : 'gemini'
        });

        const summary = await Service.ingestSourceFiles({
            tenantId: 'tenant-a',
            files   : [{parsedChunks: [validParsedChunk({
                sourcePath: 'src/remote-large.js',
                content   : 'x'.repeat(300)
            })]}]
        });

        expect(summary.ingested).toBe(1);
        expect(summary.embeddingsGenerated).toBe(1);
        expect(summary.skippedOversized).toBe(0);
        expect(summary.errors).toEqual([]);
        expect(vectorCalls).toHaveLength(1);
        expect(vectorCalls[0].records[0].sourcePath).toBe('src/remote-large.js');
    });

    test('captures VectorService refusal as a summary error without losing the summary', async () => {
        Service.vectorService = {
            embed: async () => ({
                error  : 'KB sync work volume exceeds MCP-callable threshold',
                code   : 'KB_SYNC_VOLUME_EXCEEDED',
                message: 'too many chunks'
            })
        };

        const summary = await Service.ingestSourceFiles({
            tenantId: 'tenant-a',
            files   : [{parsedChunks: [validParsedChunk()]}]
        });

        expect(summary.ingested).toBe(1);
        expect(summary.embeddingsGenerated).toBe(0);
        expect(summary.errors[0]).toMatchObject({
            code   : 'KB_SYNC_VOLUME_EXCEEDED',
            message: 'too many chunks'
        });
        expect(metrics[0].eventType).toBe('error');
    });

    test('threads viaMcp:false to VectorService.embed for the bulk CLI path (#11635)', async () => {
        const summary = await Service.ingestSourceFiles({
            tenantId: 'tenant-a',
            files   : [{parsedChunks: [validParsedChunk()]}],
            viaMcp  : false
        });

        expect(summary.ingested).toBe(1);
        expect(vectorCalls).toHaveLength(1);
        expect(vectorCalls[0].options.viaMcp).toBe(false);
    });

    test('defaults to the MCP-safe viaMcp:true when the caller omits viaMcp (#11635)', async () => {
        const summary = await Service.ingestSourceFiles({
            tenantId: 'tenant-a',
            files   : [{parsedChunks: [validParsedChunk()]}]
        });

        expect(summary.ingested).toBe(1);
        expect(vectorCalls[0].options.viaMcp).toBe(true);
    });

    test('preserves an explicit viaMcp:true for the MCP facade path (#11635)', async () => {
        await Service.ingestSourceFiles({
            tenantId: 'tenant-a',
            files   : [{parsedChunks: [validParsedChunk()]}],
            viaMcp  : true
        });

        expect(vectorCalls[0].options.viaMcp).toBe(true);
    });

    test('stamps the resolved tenant-config version onto the ingestion tenant context (#11637)', async () => {
        Service.getTenantConfig = async () => ({version: 7});

        const summary = await Service.ingestSourceFiles({
            tenantId: 'tenant-a',
            files   : [{parsedChunks: [validParsedChunk()]}]
        });

        expect(summary.ingested).toBe(1);
        expect(vectorCalls[0].options.tenantContext.configVersion).toBe(7);
    });

    test('degrades tenantConfigVersion to 0 when tenant-config resolution fails — ingest still succeeds (#11637)', async () => {
        Service.getTenantConfig = async () => { throw new Error('graph unavailable'); };

        const summary = await Service.ingestSourceFiles({
            tenantId: 'tenant-a',
            files   : [{parsedChunks: [validParsedChunk()]}]
        });

        expect(summary.ingested).toBe(1);
        expect(summary.errors).toEqual([]);
        expect(vectorCalls[0].options.tenantContext.configVersion).toBe(0);
    });
});

test.describe('IngestionService.tenantConfig (#11637)', () => {
    let Service;
    let originals;
    let graphStub;

    test.beforeAll(async () => {
        Service = (await import('../../../../../../ai/services/knowledge-base/IngestionService.mjs')).default;
    });

    test.beforeEach(() => {
        graphStub = createGraphStub();
        originals = {
            graphService         : Service.graphService,
            readKbConfigBootstrap: Service.readKbConfigBootstrap,
            requestContextService: Service.requestContextService
        };

        Service.graphService          = graphStub;
        Service.readKbConfigBootstrap = () => null;
        Service.requestContextService = {
            getAgentIdentityNodeId: () => '@tenant-a',
            getUserId             : () => 'tenant-a'
        };
    });

    test.afterEach(() => {
        Object.assign(Service, originals);
    });

    test('setTenantConfig persists a versioned KnowledgeBaseTenantConfig node that getTenantConfig reads back', async () => {
        const written = await Service.setTenantConfig({
            tenantId: 'tenant-a',
            config  : {useDefaultSources: false, rawRepoSource: true, customParsers: [{parserId: 'es5'}]}
        });
        expect(written).toEqual({tenantId: 'tenant-a', version: 1});

        const node = graphStub.store.get('kb-config:tenant-a');
        expect(node.type).toBe('KnowledgeBaseTenantConfig');

        const resolved = await Service.getTenantConfig({tenantId: 'tenant-a'});
        expect(resolved).toMatchObject({
            tenantId         : 'tenant-a',
            source           : 'graph',
            version          : 1,
            useDefaultSources: false,
            rawRepoSource    : true,
            customParsers    : [{parserId: 'es5'}]
        });
    });

    test('setTenantConfig increments the config version on each mutation', async () => {
        const first  = await Service.setTenantConfig({tenantId: 'tenant-a', config: {}});
        const second = await Service.setTenantConfig({tenantId: 'tenant-a', config: {useDefaultParsers: false}});

        expect(first.version).toBe(1);
        expect(second.version).toBe(2);
        expect((await Service.getTenantConfig({tenantId: 'tenant-a'})).version).toBe(2);
    });

    test('setTenantConfig rejects a cross-tenant write via the resolveTenantContext RLS gate', async () => {
        // The authenticated context is tenant-a (beforeEach); a write targeting tenant-b must be refused.
        const result = await Service.setTenantConfig({tenantId: 'tenant-b', config: {}});

        expect(result.code).toBe('KB_INGEST_TENANT_MISMATCH');
        expect(result.error).toBe('Tenant config write failed');
        expect(graphStub.store.has('kb-config:tenant-b')).toBe(false);
    });

    test('setTenantConfig stamps visibility:team on the kb-config node for offline daemon reads (#11716)', async () => {
        await Service.setTenantConfig({tenantId: 'tenant-a', config: {}});

        // `GraphService.upsertNode` stamps the request identity onto `properties.userId`; without an
        // explicit `visibility:'team'` marker the node is invisible to the offline reconciliation
        // daemon (which reads `getTenantConfig` with no request context). The marker is the offline-read
        // authorization, parallel to the `kb-manifest` sibling node.
        const node = graphStub.store.get('kb-config:tenant-a');
        expect(node.type).toBe('KnowledgeBaseTenantConfig');
        expect(node.properties.visibility).toBe('team');

        // The marker survives a version-bumping re-write.
        await Service.setTenantConfig({tenantId: 'tenant-a', config: {useDefaultParsers: false}});
        const bumped = graphStub.store.get('kb-config:tenant-a');
        expect(bumped.properties.version).toBe(2);
        expect(bumped.properties.visibility).toBe('team');
    });

    test('setTenantConfig normalizes tenant repo-access entries without persisting credentials (#11787)', async () => {
        const written = await Service.setTenantConfig({
            tenantId: 'tenant-a',
            config  : {
                tenantRepos: [{
                    cloneUrl     : 'https://github.com/neomjs/neo.git',
                    credentialRef: 'env:GITHUB_TOKEN'
                }]
            }
        });

        expect(written).toEqual({tenantId: 'tenant-a', version: 1});

        const node = graphStub.store.get('kb-config:tenant-a');

        expect(node.properties.tenantRepos).toEqual([{
            cloneUrl     : 'https://github.com/neomjs/neo.git',
            credentialRef: 'env:GITHUB_TOKEN',
            repoSlug     : 'github.com/neomjs/neo'
        }]);

        expect((await Service.getTenantConfig({tenantId: 'tenant-a'})).tenantRepos).toEqual(node.properties.tenantRepos);
    });

    test('setTenantConfig rejects credential-bearing tenant repo clone URLs (#11787)', async () => {
        const result = await Service.setTenantConfig({
            tenantId: 'tenant-a',
            config  : {
                tenantRepos: [{
                    cloneUrl     : 'https://token:secret@github.com/neomjs/neo.git',
                    credentialRef: 'env:GITHUB_TOKEN'
                }]
            }
        });

        expect(result.code).toBe('KB_TENANT_REPO_CLONE_URL_CREDENTIALS');
        expect(result.error).toBe('Tenant config write failed');
        expect(graphStub.store.has('kb-config:tenant-a')).toBe(false);
    });

    test('setTenantManifest persists repo manifests without bumping KnowledgeBaseTenantConfig.version (#11711)', async () => {
        await Service.setTenantConfig({tenantId: 'tenant-a', config: {customParsers: [{parserId: 'alpha'}]}});

        const written = await Service.setTenantManifest({
            tenantId      : 'tenant-a',
            repoSlug      : 'repo-a',
            pathsAfterPush: ['src/z.js', 'src/a.js', 'src/a.js']
        });

        expect(written).toMatchObject({
            tenantId      : 'tenant-a',
            repoSlug      : 'repo-a',
            pathsAfterPush: ['src/a.js', 'src/z.js']
        });

        const node = graphStub.store.get('kb-manifest:tenant-a');
        expect(node.type).toBe('KnowledgeBaseTenantManifest');
        expect(node.properties.visibility).toBe('team');
        expect(node.properties.manifests['repo-a'].pathsAfterPush).toEqual(['src/a.js', 'src/z.js']);

        const manifest = await Service.getTenantManifest({tenantId: 'tenant-a', repoSlug: 'repo-a'});
        expect(manifest).toMatchObject({
            tenantId      : 'tenant-a',
            repoSlug      : 'repo-a',
            source        : 'graph',
            pathsAfterPush: ['src/a.js', 'src/z.js']
        });

        expect((await Service.getTenantConfig({tenantId: 'tenant-a'})).version).toBe(1);
    });

    test('setTenantManifest rejects malformed path manifests without writing a graph node (#11711)', async () => {
        const result = await Service.setTenantManifest({
            tenantId      : 'tenant-a',
            repoSlug      : 'repo-a',
            pathsAfterPush: 'src/a.js'
        });

        expect(result).toMatchObject({
            error: 'Tenant manifest write failed',
            code : 'KB_TENANT_MANIFEST_INVALID'
        });
        expect(graphStub.store.has('kb-manifest:tenant-a')).toBe(false);
    });

    test('getTenantConfig falls back to the default registry when no graph node exists', async () => {
        const resolved = await Service.getTenantConfig({tenantId: 'tenant-without-config'});

        expect(resolved.source).toBe('default');
        expect(resolved.version).toBe(0);
        expect(typeof resolved.useDefaultSources).toBe('boolean');
    });

    test('getTenantConfig resolves the kb-config.yaml bootstrap tier when no graph node exists', async () => {
        Service.readKbConfigBootstrap = () => ({
            tenants: {
                'tenant-a': {useDefaultSources: false, rawRepoSource: true, customSources: [{sourceName: 'BootstrapSource'}]}
            }
        });

        const resolved = await Service.getTenantConfig({tenantId: 'tenant-a'});
        expect(resolved).toMatchObject({
            tenantId         : 'tenant-a',
            source           : 'yaml',
            version          : 0,
            useDefaultSources: false,
            rawRepoSource    : true,
            customSources    : [{sourceName: 'BootstrapSource'}]
        });

        // A tenant absent from the bootstrap still falls through to the default tier.
        expect((await Service.getTenantConfig({tenantId: 'tenant-z'})).source).toBe('default');
    });
});

test.describe('IngestionService.listConfiguredTenantRepos (#12145)', () => {
    let Service;
    let originals;
    let graphStub;
    let originalAiConfigRepos;

    test.beforeAll(async () => {
        Service = (await import('../../../../../../ai/services/knowledge-base/IngestionService.mjs')).default;
    });

    test.beforeEach(() => {
        graphStub = createGraphStub();
        originals = {
            graphService         : Service.graphService,
            readKbConfigBootstrap: Service.readKbConfigBootstrap
        };
        originalAiConfigRepos = aiConfig.tenantRepos;

        Service.graphService          = graphStub;
        Service.readKbConfigBootstrap = () => null;
    });

    test.afterEach(() => {
        Object.assign(Service, originals);
        aiConfig.tenantRepos = originalAiConfigRepos;
    });

    function seedGraphConfig(tenantId, tenantRepos) {
        graphStub.store.set(`kb-config:${tenantId}`, {
            id        : `kb-config:${tenantId}`,
            type      : 'KnowledgeBaseTenantConfig',
            properties: {tenantId, tenantRepos, visibility: 'team'}
        });
    }

    test('flattens per-tenant yaml-tier tenantRepos across tenants and stamps tenantId', async () => {
        Service.readKbConfigBootstrap = () => ({
            tenants: {
                'tenant-a': {tenantRepos: [{cloneUrl: 'https://github.com/neomjs/a.git', credentialRef: 'env:A'}]},
                'tenant-b': {tenantRepos: [{cloneUrl: 'https://github.com/neomjs/b.git', credentialRef: 'env:B'}]}
            }
        });

        const {tenantRepos} = await Service.listConfiguredTenantRepos();

        expect(tenantRepos).toHaveLength(2);
        expect(tenantRepos.find(r => r.tenantId === 'tenant-a')).toMatchObject({
            cloneUrl: 'https://github.com/neomjs/a.git', credentialRef: 'env:A', repoSlug: 'github.com/neomjs/a', configTier: 'yaml'
        });
        expect(tenantRepos.find(r => r.tenantId === 'tenant-b')).toMatchObject({
            cloneUrl: 'https://github.com/neomjs/b.git', credentialRef: 'env:B', configTier: 'yaml'
        });
    });

    test('graph-node tier wins WHOLESALE over yaml for the same tenant (no within-tenant merge)', async () => {
        seedGraphConfig('tenant-a', [{cloneUrl: 'https://github.com/neomjs/graph.git', credentialRef: 'env:G'}]);
        Service.readKbConfigBootstrap = () => ({
            tenants: {'tenant-a': {tenantRepos: [{cloneUrl: 'https://github.com/neomjs/yaml.git', credentialRef: 'env:Y'}]}}
        });

        const {tenantRepos} = await Service.listConfiguredTenantRepos();

        expect(tenantRepos).toHaveLength(1);
        expect(tenantRepos[0]).toMatchObject({
            tenantId: 'tenant-a', cloneUrl: 'https://github.com/neomjs/graph.git', credentialRef: 'env:G', configTier: 'graph'
        });
    });

    test('includes graph-only tenantRepos discovered through the graph service enumeration surface', async () => {
        seedGraphConfig('graph-only-tenant', [{cloneUrl: 'https://github.com/neomjs/x.git', credentialRef: 'env:X'}]);
        Service.readKbConfigBootstrap = () => ({
            tenants: {'tenant-a': {tenantRepos: [{cloneUrl: 'https://github.com/neomjs/a.git', credentialRef: 'env:A'}]}}
        });

        const {tenantRepos} = await Service.listConfiguredTenantRepos();

        expect(tenantRepos).toHaveLength(2);
        expect(tenantRepos.find(r => r.tenantId === 'tenant-a')).toMatchObject({
            cloneUrl  : 'https://github.com/neomjs/a.git',
            configTier: 'yaml'
        });
        expect(tenantRepos.find(r => r.tenantId === 'graph-only-tenant')).toMatchObject({
            cloneUrl     : 'https://github.com/neomjs/x.git',
            credentialRef: 'env:X',
            repoSlug     : 'github.com/neomjs/x',
            configTier   : 'graph'
        });
    });

    test('propagates the access-contract rejection for a yaml entry missing credentialRef', async () => {
        Service.readKbConfigBootstrap = () => ({
            tenants: {'tenant-a': {tenantRepos: [{cloneUrl: 'https://github.com/neomjs/a.git'}]}}
        });

        await expect(Service.listConfiguredTenantRepos()).rejects.toThrow();
    });

    test('propagates graph-only tenantRepos normalization failures', async () => {
        seedGraphConfig('graph-only-tenant', [{cloneUrl: 'https://github.com/neomjs/x.git'}]);

        await expect(Service.listConfiguredTenantRepos()).rejects.toThrow();
    });

    test('fails loud when graph-tier tenant discovery is unavailable', async () => {
        delete graphStub.listNodeRecordsByType;
        Service.readKbConfigBootstrap = () => ({tenants: {'tenant-a': {tenantRepos: []}}});

        await expect(Service.listConfiguredTenantRepos()).rejects.toThrow('GraphService.listNodeRecordsByType');
    });

    test('returns an empty array when no tenant declares tenantRepos', async () => {
        Service.readKbConfigBootstrap = () => ({tenants: {'tenant-a': {useDefaultSources: false}}});

        const {tenantRepos} = await Service.listConfiguredTenantRepos();
        expect(tenantRepos).toEqual([]);
    });

    test('graph-node tier with empty tenantRepos suppresses yaml + default for that tenant (presence-based winner)', async () => {
        // An existing graph record declaring `tenantRepos: []` intentionally disables pull-mode for
        // the tenant; it must win wholesale even though the array is empty — selecting on length > 0
        // would leak the yaml/default repos back in (the cycle-1 fallback bug).
        seedGraphConfig('tenant-a', []);
        Service.readKbConfigBootstrap = () => ({
            tenants: {'tenant-a': {tenantRepos: [{cloneUrl: 'https://github.com/neomjs/yaml.git', credentialRef: 'env:Y'}]}}
        });

        const {tenantRepos} = await Service.listConfiguredTenantRepos();
        expect(tenantRepos).toEqual([]);
    });

    test('yaml tier with empty tenantRepos suppresses the aiConfig default tier for that tenant (presence-based winner)', async () => {
        aiConfig.tenantRepos = [{tenantId: 'tenant-a', cloneUrl: 'https://github.com/neomjs/default.git', credentialRef: 'env:D'}];
        Service.readKbConfigBootstrap = () => ({
            tenants: {'tenant-a': {tenantRepos: []}}
        });

        const {tenantRepos} = await Service.listConfiguredTenantRepos();
        expect(tenantRepos).toEqual([]);
    });
});
