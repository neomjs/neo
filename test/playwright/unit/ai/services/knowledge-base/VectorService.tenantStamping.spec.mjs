import {setup} from '../../../../setup.mjs';

const appName = 'KBTenantStampingTest';

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
import fs             from 'fs';
import path           from 'path';
import os             from 'os';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * Write-side tenant isolation coverage for `VectorService.embed` (#11631).
 *
 * The tests replace ChromaDB with an in-memory spy collection and stub the embedding
 * provider, so they verify only the write-boundary contract: authoritative tenant
 * stamping, spoof handling, and tenant-aware IDs.
 *
 * Serial mode: specs mutate singleton services and KB config.
 */
test.describe.configure({mode: 'serial'});

function createSpyCollection({existingIds = []} = {}) {
    const rows = new Map();
    existingIds.forEach(id => rows.set(id, {id, metadata: {}, document: ''}));

    const calls = {get: 0, upsert: 0, delete: 0, count: 0};

    return {
        rows,
        calls,
        name: 'spy-knowledge-base',

        async get({limit = 2000, offset = 0, include = []} = {}) {
            calls.get++;
            const all   = Array.from(rows.keys());
            const slice = all.slice(offset, offset + limit);

            return {
                ids      : slice,
                metadatas: include.includes('metadatas') ? slice.map(() => ({})) : [],
                documents: include.includes('documents') ? slice.map(() => '') : []
            };
        },

        async upsert({ids, embeddings, metadatas}) {
            calls.upsert++;
            ids.forEach((id, i) => rows.set(id, {
                id,
                metadata : metadatas?.[i] ?? {},
                embedding: embeddings?.[i] ?? null
            }));
        },

        async delete({ids}) {
            calls.delete++;
            ids.forEach(id => rows.delete(id));
        },

        async count() {
            calls.count++;
            return rows.size;
        }
    };
}

function writeFixtureJsonl(filePath, chunks) {
    fs.writeFileSync(filePath, chunks.map(chunk => JSON.stringify(chunk)).join('\n'), 'utf8');
}

function getOnlyRow(spy) {
    return Array.from(spy.rows.values())[0];
}

test.describe('VectorService.embed — tenant stamping (#11631)', () => {
    let SDK, KB_VectorService, KB_DatabaseService, KB_ChromaManager, KB_Config, Logger;
    let TextEmbeddingService;
    let originalGetCollection;
    let originalEmbedTexts;
    let originalWarn;
    let originalConfig;
    let tmpDir, fixturePath;
    let warnCalls;

    test.beforeAll(async () => {
        SDK              = await import('../../../../../../ai/services.mjs');
        KB_ChromaManager = SDK.KB_ChromaManager;
        KB_Config        = SDK.KB_Config;
        TextEmbeddingService = SDK.Memory_TextEmbeddingService;

        const VectorServiceModule   = await import('../../../../../../ai/services/knowledge-base/VectorService.mjs');
        const DatabaseServiceModule = await import('../../../../../../ai/services/knowledge-base/DatabaseService.mjs');
        const LoggerModule          = await import('../../../../../../ai/mcp/server/knowledge-base/logger.mjs');

        KB_VectorService   = VectorServiceModule.default;
        KB_DatabaseService = DatabaseServiceModule.default;
        Logger             = LoggerModule.default;

        originalGetCollection = KB_ChromaManager.getKnowledgeBaseCollection.bind(KB_ChromaManager);
        originalEmbedTexts    = TextEmbeddingService.embedTexts.bind(TextEmbeddingService);
        originalWarn          = Logger.warn.bind(Logger);
        originalConfig        = {
            batchSize              : KB_Config.data.batchSize,
            batchDelay             : KB_Config.data.batchDelay,
            maxRetries             : KB_Config.data.maxRetries,
            defaultTenantId        : KB_Config.data.defaultTenantId,
            defaultRepoSlug        : KB_Config.data.defaultRepoSlug,
            defaultVisibility      : KB_Config.data.defaultVisibility,
            spoofRejectionMode     : KB_Config.data.spoofRejectionMode,
            knowledgeBase          : KB_Config.data.knowledgeBase,
            mcpSyncMaxChunks       : KB_Config.data.mcpSyncMaxChunks
        };

        TextEmbeddingService.embedTexts = async texts => texts.map(() => new Array(384).fill(0));

        tmpDir      = path.resolve(os.tmpdir(), `kb-tenant-stamping-test-${process.pid}-${Date.now()}`);
        fs.mkdirSync(tmpDir, {recursive: true});
        fixturePath = path.join(tmpDir, 'fixture.jsonl');
    });

    test.afterAll(async () => {
        KB_ChromaManager.getKnowledgeBaseCollection = originalGetCollection;
        TextEmbeddingService.embedTexts             = originalEmbedTexts;
        Logger.warn                                 = originalWarn;
        Object.assign(KB_Config.data, originalConfig);

        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, {recursive: true, force: true});
        }
    });

    test.beforeEach(() => {
        // KB_Config now extends Neo.state.Provider: `data` is a reactive proxy. The flat
        // tenant keys below are registered leaves, so re-assigning them resets cleanly.
        // `knowledgeBase` is deliberately NOT reset here: it is an unregistered nested
        // namespace, and writing `undefined`/`null` through the reactive pipeline creates a
        // sticky falsy parent config that blocks the nested-shape test from rebuilding the
        // object. Leaving it untouched keeps the parent unregistered (falsy → the consumer's
        // `aiConfig.knowledgeBase ?? aiConfig` falls back to the flat keys); the one nested
        // test installs and tears down its own override.
        Object.assign(KB_Config.data, {
            batchSize         : 50,
            batchDelay        : 0,
            maxRetries        : 1,
            defaultTenantId   : 'neo-shared',
            defaultRepoSlug   : 'neo',
            defaultVisibility : 'team',
            spoofRejectionMode: 'overwrite',
            mcpSyncMaxChunks  : 50
        });

        warnCalls   = [];
        Logger.warn = (...args) => warnCalls.push(args);
    });

    test('stamps Neo default tenant metadata before upsert', async () => {
        const spy = createSpyCollection();
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spy;

        writeFixtureJsonl(fixturePath, [{
            hash       : 'raw-hash-1',
            type       : 'guide',
            name       : 'DefaultTenantDoc',
            className  : '',
            description: 'default tenant stamping',
            content    : 'body'
        }]);

        const result = await KB_VectorService.embed(fixturePath);
        const row    = getOnlyRow(spy);

        expect(result.message).toContain('Embedding complete');
        expect(row.id).toHaveLength(64);
        expect(row.metadata.id).toBe(row.id);
        expect(row.metadata.hash).toBe(row.id);
        expect(row.metadata.tenantId).toBe('neo-shared');
        expect(row.metadata.repoSlug).toBe('neo');
        expect(row.metadata.visibility).toBe('team');
        expect('originAgentIdentity' in row.metadata).toBe(false);
        expect(row.metadata.tenantConfigVersion).toBe(0);
        expect(warnCalls).toHaveLength(0);
    });

    test('stamps the active tenant-config version onto chunk metadata (#11637)', async () => {
        const spy = createSpyCollection();
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spy;

        writeFixtureJsonl(fixturePath, [{
            hash       : 'raw-hash-cfg',
            type       : 'guide',
            name       : 'TenantConfigVersionDoc',
            className  : '',
            description: 'tenant config version stamping',
            content    : 'body'
        }]);

        await KB_VectorService.embed(fixturePath, {
            tenantContext: {tenantId: 'tenant-a', repoSlug: 'repo-a', visibility: 'team', configVersion: 7}
        });

        expect(getOnlyRow(spy).metadata.tenantConfigVersion).toBe(7);
    });

    test('overwrites conflicting client-supplied tenant metadata and logs diagnostics', async () => {
        const spy = createSpyCollection();
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spy;

        writeFixtureJsonl(fixturePath, [{
            hash               : 'raw-hash-2',
            type               : 'guide',
            name               : 'ExternalTenantDoc',
            className          : '',
            description        : 'external tenant stamping',
            content            : 'body',
            tenantId           : 'client-tenant',
            repoSlug           : 'client-repo',
            visibility         : 'public',
            originAgentIdentity: '@client-claim'
        }]);

        await KB_VectorService.embed(fixturePath, {
            tenantContext: {
                tenantId           : 'server-tenant',
                repoSlug           : 'server-repo',
                visibility         : 'private',
                originAgentIdentity: '@neo-gpt'
            }
        });

        const row = getOnlyRow(spy);
        const warnedFields = warnCalls.map(([, details]) => details.field).sort();

        expect(row.metadata.tenantId).toBe('server-tenant');
        expect(row.metadata.repoSlug).toBe('server-repo');
        expect(row.metadata.visibility).toBe('private');
        expect(row.metadata.originAgentIdentity).toBe('@neo-gpt');
        expect(warnedFields).toEqual(['originAgentIdentity', 'repoSlug', 'tenantId', 'visibility']);
        expect(warnCalls[0][0]).toContain('Overwriting client-supplied tenant metadata field');
        expect(warnCalls[0][1].originAgentIdentity).toBe('@neo-gpt');
    });

    test('derives distinct Chroma IDs for identical chunks in different tenants', async () => {
        const chunk = {
            hash       : 'same-content-hash',
            type       : 'guide',
            name       : 'SameDoc',
            className  : '',
            description: 'same bytes',
            content    : 'same body'
        };

        const spyA = createSpyCollection();
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spyA;
        writeFixtureJsonl(fixturePath, [chunk]);
        await KB_VectorService.embed(fixturePath, {
            tenantContext: {tenantId: 'tenant-a', repoSlug: 'repo-a', visibility: 'team'}
        });

        const idA = getOnlyRow(spyA).id;

        const spyB = createSpyCollection();
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spyB;
        writeFixtureJsonl(fixturePath, [chunk]);
        await KB_VectorService.embed(fixturePath, {
            tenantContext: {tenantId: 'tenant-b', repoSlug: 'repo-a', visibility: 'team'}
        });

        const idB = getOnlyRow(spyB).id;

        expect(idA).toHaveLength(64);
        expect(idB).toHaveLength(64);
        expect(idA).not.toBe(idB);
    });

    test('reject mode fails before Chroma writes when client metadata conflicts', async () => {
        const spy = createSpyCollection();
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spy;
        KB_Config.data.spoofRejectionMode = 'reject';

        writeFixtureJsonl(fixturePath, [{
            hash       : 'raw-hash-3',
            type       : 'guide',
            name       : 'RejectedTenantDoc',
            className  : '',
            description: 'tenant spoof',
            content    : 'body',
            tenantId   : 'client-tenant'
        }]);

        await expect(KB_VectorService.embed(fixturePath, {
            tenantContext: {tenantId: 'server-tenant', repoSlug: 'server-repo', visibility: 'team'}
        })).rejects.toMatchObject({
            code: 'KB_TENANT_SPOOF_REJECTED'
        });

        expect(spy.calls.get).toBe(0);
        expect(spy.calls.upsert).toBe(0);
        expect(warnCalls).toHaveLength(0);
    });

    test('honors nested knowledgeBase isolation config shape', async () => {
        const spy = createSpyCollection();
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spy;

        // VectorService.getTenantIsolationConfig() reads `aiConfig.knowledgeBase ?? aiConfig`,
        // so a truthy nested `knowledgeBase` object takes precedence over the flat tenant keys.
        // Under the reactive Provider, assigning an object to the (currently unregistered)
        // `knowledgeBase` namespace registers + populates the nested leaves the consumer reads.
        try {
            KB_Config.data.knowledgeBase = {
                defaultTenantId   : 'nested-tenant',
                defaultRepoSlug   : 'nested-repo',
                defaultVisibility : 'private',
                spoofRejectionMode: 'overwrite'
            };

            writeFixtureJsonl(fixturePath, [{
                hash       : 'raw-hash-4',
                type       : 'guide',
                name       : 'NestedConfigDoc',
                className  : '',
                description: 'nested config',
                content    : 'body'
            }]);

            await KB_VectorService.embed(fixturePath);

            const row = getOnlyRow(spy);

            expect(row.metadata.tenantId).toBe('nested-tenant');
            expect(row.metadata.repoSlug).toBe('nested-repo');
            expect(row.metadata.visibility).toBe('private');
        } finally {
            // Reset to a clean falsy parent so subsequent serial tests fall back to the flat
            // tenant keys. `null` (not `undefined`) reliably clears the reactive leaf value.
            KB_Config.setData('knowledgeBase', null);
        }
    });

    test('content hashes include tenant and repository identity', () => {
        const baseChunk = {
            type       : 'guide',
            name       : 'HashDoc',
            description: 'same',
            content    : 'same'
        };

        const tenantAHash = KB_DatabaseService.createContentHash({
            ...baseChunk,
            tenantId: 'tenant-a',
            repoSlug: 'repo'
        });
        const tenantBHash = KB_DatabaseService.createContentHash({
            ...baseChunk,
            tenantId: 'tenant-b',
            repoSlug: 'repo'
        });
        const defaultHash = KB_DatabaseService.createContentHash(baseChunk);
        const explicitDefaultHash = KB_DatabaseService.createContentHash({
            ...baseChunk,
            tenantId: 'neo-shared',
            repoSlug: 'neo'
        });

        expect(tenantAHash).not.toBe(tenantBHash);
        expect(defaultHash).toBe(explicitDefaultHash);
    });

    test('stamps a server-derived ingestedAt timestamp onto chunk metadata (#11712)', async () => {
        const spy = createSpyCollection();
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spy;

        writeFixtureJsonl(fixturePath, [{
            hash       : 'raw-hash-ingestedat',
            type       : 'guide',
            name       : 'IngestedAtDoc',
            className  : '',
            description: 'ingestedAt stamping',
            content    : 'body'
        }]);

        const before = Date.now();
        await KB_VectorService.embed(fixturePath);
        const after  = Date.now();

        const {ingestedAt} = getOnlyRow(spy).metadata;

        expect(typeof ingestedAt).toBe('number');
        expect(Number.isFinite(ingestedAt)).toBe(true);
        expect(ingestedAt).toBeGreaterThanOrEqual(before);
        expect(ingestedAt).toBeLessThanOrEqual(after);
        expect(warnCalls).toHaveLength(0);
    });

    test('overwrites a client-supplied ingestedAt and logs diagnostics (#11712)', async () => {
        const spy = createSpyCollection();
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spy;

        writeFixtureJsonl(fixturePath, [{
            hash       : 'raw-hash-ingestedat-spoof',
            type       : 'guide',
            name       : 'IngestedAtSpoofDoc',
            className  : '',
            description: 'client ingestedAt spoof',
            content    : 'body',
            ingestedAt : 111
        }]);

        const before = Date.now();
        await KB_VectorService.embed(fixturePath);

        const row = getOnlyRow(spy);

        // The server stamp (Date.now()) wins over the client-supplied stale value.
        expect(row.metadata.ingestedAt).not.toBe(111);
        expect(row.metadata.ingestedAt).toBeGreaterThanOrEqual(before);
        expect(warnCalls.map(([, details]) => details.field)).toContain('ingestedAt');
    });

    test('reject mode rejects a client-supplied ingestedAt before Chroma writes (#11712)', async () => {
        const spy = createSpyCollection();
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spy;
        KB_Config.data.spoofRejectionMode = 'reject';

        writeFixtureJsonl(fixturePath, [{
            hash       : 'raw-hash-ingestedat-reject',
            type       : 'guide',
            name       : 'IngestedAtRejectDoc',
            className  : '',
            description: 'client ingestedAt spoof, reject mode',
            content    : 'body',
            ingestedAt : 111
        }]);

        await expect(KB_VectorService.embed(fixturePath)).rejects.toMatchObject({
            code: 'KB_TENANT_SPOOF_REJECTED'
        });

        expect(spy.calls.get).toBe(0);
        expect(spy.calls.upsert).toBe(0);
        expect(warnCalls).toHaveLength(0);
    });

    test('a same-content re-push retains the prior ingestedAt — zero-change fast path (#11712)', async () => {
        const spy = createSpyCollection();
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spy;

        const chunk = {
            hash       : 'raw-hash-repush',
            type       : 'guide',
            name       : 'RepushDoc',
            className  : '',
            description: 'stable content',
            content    : 'unchanged body'
        };

        writeFixtureJsonl(fixturePath, [chunk]);
        await KB_VectorService.embed(fixturePath);

        const firstIngestedAt = getOnlyRow(spy).metadata.ingestedAt;

        expect(typeof firstIngestedAt).toBe('number');
        expect(spy.calls.upsert).toBe(1);

        // Re-push byte-identical content: embed()'s zero-change fast path skips the
        // already-known content-hash ID — no re-upsert, so ingestedAt is NOT refreshed.
        // ingestedAt marks the actual embed/upsert, not the push attempt.
        writeFixtureJsonl(fixturePath, [chunk]);
        await KB_VectorService.embed(fixturePath);

        expect(spy.calls.upsert).toBe(1); // still 1 — the re-push upserted nothing
        expect(getOnlyRow(spy).metadata.ingestedAt).toBe(firstIngestedAt);
    });
});
