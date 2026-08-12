import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import crypto         from 'crypto';
import fs             from 'fs/promises';
import os             from 'os';
import path           from 'path';
import {
    EMBEDDING_POISON_MAX_ENTRIES,
    clearEmbeddingPoisonState,
    createEmbeddingGenerationId,
    createEmbeddingPoisonScopeId,
    getEmbeddingPoisonStateFilePath,
    readEmbeddingPoisonState,
    upsertEmbeddingPoisonEntries
} from '../../../../../../ai/services/knowledge-base/helpers/kbEmbeddingPoisonStore.mjs';

const GENERATION = createEmbeddingGenerationId({
    provider       : 'openAiCompatible',
    model          : 'text-embedding-model',
    vectorDimension: 768,
    strategyVersion: 'kb-input-v1'
});

const REASON_CODE = 'KB_VECTOR_EMBED_FAILED';

function hash(value) {
    return crypto.createHash('sha256').update(value).digest('hex')
}

async function createFixture() {
    const dir     = await fs.mkdtemp(path.join(os.tmpdir(), 'kb-embedding-poison-'));
    const scopeId = createEmbeddingPoisonScopeId({
        tenantId: 'private-tenant-identity',
        repoSlug: 'private/repository-identity'
    });

    return {
        dir,
        filePath: getEmbeddingPoisonStateFilePath({dir, scopeId}),
        scopeId
    }
}

test.describe('kbEmbeddingPoisonStore — bounded durable poison disposition', () => {
    const fixtures = [];

    test.afterEach(async () => {
        await Promise.all(fixtures.splice(0).map(dir => fs.rm(dir, {recursive: true, force: true})))
    });

    async function fixture() {
        const value = await createFixture();
        fixtures.push(value.dir);
        return value
    }

    test('persists only hashed coordinates and exact safe entry fields', async () => {
        const {dir, filePath, scopeId} = await fixture();
        const secretProvider           = 'https://embedding.example.invalid/v1?credential=bearer-secret';
        const secretModel              = 'private-model-name';
        const generationId             = createEmbeddingGenerationId({
            provider       : secretProvider,
            model          : secretModel,
            vectorDimension: 1024,
            strategyVersion: 'private-input-strategy'
        });
        const chunkId = hash('raw private chunk content');

        await upsertEmbeddingPoisonEntries({
            dir,
            scopeId,
            generationId,
            entries: [{chunkId, reasonCode: REASON_CODE}],
            now    : Date.UTC(2026, 7, 12, 10, 0, 0)
        });

        const raw   = await fs.readFile(filePath, 'utf8');
        const state = JSON.parse(raw);

        expect(path.basename(filePath)).toBe(`kb-embedding-poison-${scopeId}.json`);
        expect(Object.keys(state).sort()).toEqual([
            'createdAt', 'entries', 'generationId', 'schemaVersion', 'scopeId', 'updatedAt'
        ]);
        expect(Object.keys(state.entries[0]).sort()).toEqual(['chunkId', 'observedAt', 'reasonCode']);
        expect(raw).not.toContain('private-tenant-identity');
        expect(raw).not.toContain('private/repository-identity');
        expect(raw).not.toContain(secretProvider);
        expect(raw).not.toContain(secretModel);
        expect(raw).not.toContain('raw private chunk content');
        expect(raw).not.toContain('bearer-secret');
    });

    test('rejects raw ids, arbitrary bounded-looking codes, and extra secret-bearing fields', async () => {
        const {dir, scopeId} = await fixture();

        await expect(upsertEmbeddingPoisonEntries({
            dir,
            scopeId,
            generationId: GENERATION,
            entries     : [{chunkId: 'raw-chunk-id', reasonCode: REASON_CODE}]
        })).rejects.toThrow(/SHA-256/);

        await expect(upsertEmbeddingPoisonEntries({
            dir,
            scopeId,
            generationId: GENERATION,
            entries     : [{chunkId: hash('chunk'), reasonCode: 'KB_SECRET_TOKEN'}]
        })).rejects.toThrow(/declared bounded embed-failure code/);

        await expect(upsertEmbeddingPoisonEntries({
            dir,
            scopeId,
            generationId: GENERATION,
            entries     : [{chunkId: hash('chunk'), reasonCode: REASON_CODE, content: 'secret'}]
        })).rejects.toThrow(/must contain only/);
    });

    test('corrupt and unreadable markers are explicitly unavailable and suppress nothing', async () => {
        const {dir, filePath, scopeId} = await fixture();

        await fs.mkdir(dir, {recursive: true});
        await fs.writeFile(filePath, '{not-json', 'utf8');

        await expect(readEmbeddingPoisonState({dir, scopeId, generationId: GENERATION}))
            .resolves.toEqual({status: 'unavailable', entries: []});

        await fs.rm(filePath, {force: true});
        await fs.mkdir(filePath);

        await expect(readEmbeddingPoisonState({dir, scopeId, generationId: GENERATION}))
            .resolves.toEqual({status: 'unavailable', entries: []});
    });

    test('a generation change makes every prior poison eligible again', async () => {
        const {dir, scopeId} = await fixture();
        const chunkId        = hash('generation-drift-chunk');
        const nextGeneration = createEmbeddingGenerationId({
            provider       : 'openAiCompatible',
            model          : 'text-embedding-model-v2',
            vectorDimension: 1024,
            strategyVersion: 'kb-input-v2'
        });

        await upsertEmbeddingPoisonEntries({
            dir,
            scopeId,
            generationId: GENERATION,
            entries     : [{chunkId, reasonCode: REASON_CODE}]
        });

        await expect(readEmbeddingPoisonState({dir, scopeId, generationId: GENERATION}))
            .resolves.toMatchObject({status: 'available', entries: [{chunkId}]});
        await expect(readEmbeddingPoisonState({dir, scopeId, generationId: nextGeneration}))
            .resolves.toEqual({status: 'stale', entries: []});
    });

    test('a changed chunk id re-enters while same-generation upserts merge by id', async () => {
        const {dir, scopeId} = await fixture();
        const oldChunkId     = hash('chunk-content-v1');
        const newChunkId     = hash('chunk-content-v2');

        await upsertEmbeddingPoisonEntries({
            dir,
            scopeId,
            generationId: GENERATION,
            entries     : [{chunkId: oldChunkId, reasonCode: REASON_CODE}],
            now         : Date.UTC(2026, 7, 12, 10, 0, 0)
        });

        const before = await readEmbeddingPoisonState({dir, scopeId, generationId: GENERATION});
        expect(before.entries.map(entry => entry.chunkId)).not.toContain(newChunkId);

        await upsertEmbeddingPoisonEntries({
            dir,
            scopeId,
            generationId: GENERATION,
            entries     : [{chunkId: newChunkId, reasonCode: 'KB_VECTOR_EMBED_CONNECTION_REFUSED'}],
            now         : Date.UTC(2026, 7, 12, 10, 1, 0)
        });

        const after = await readEmbeddingPoisonState({dir, scopeId, generationId: GENERATION});
        expect(after.entries.map(entry => entry.chunkId).sort()).toEqual([oldChunkId, newChunkId].sort());
    });

    test('concurrent same-process upserts atomically retain both merge inputs', async () => {
        const {dir, scopeId} = await fixture();
        const firstChunkId   = hash('concurrent-chunk-1');
        const secondChunkId  = hash('concurrent-chunk-2');

        await Promise.all([
            upsertEmbeddingPoisonEntries({
                dir,
                scopeId,
                generationId: GENERATION,
                entries     : [{chunkId: firstChunkId, reasonCode: REASON_CODE}]
            }),
            upsertEmbeddingPoisonEntries({
                dir,
                scopeId,
                generationId: GENERATION,
                entries     : [{chunkId: secondChunkId, reasonCode: REASON_CODE}]
            })
        ]);

        const state = await readEmbeddingPoisonState({dir, scopeId, generationId: GENERATION});

        expect(state.entries.map(entry => entry.chunkId).sort()).toEqual([firstChunkId, secondChunkId].sort());
    });

    test('retention is capped and evicts the oldest observations', async () => {
        const {dir, scopeId} = await fixture();
        const base           = Date.UTC(2026, 7, 12, 10, 0, 0);
        const offered        = Array.from({length: EMBEDDING_POISON_MAX_ENTRIES + 4}, (_, index) => ({
            chunkId   : hash(`chunk-${index}`),
            reasonCode: REASON_CODE,
            observedAt: new Date(base + index).toISOString()
        }));

        await upsertEmbeddingPoisonEntries({
            dir,
            scopeId,
            generationId: GENERATION,
            entries     : offered,
            now         : base + offered.length
        });

        const state       = await readEmbeddingPoisonState({dir, scopeId, generationId: GENERATION});
        const retainedIds = new Set(state.entries.map(entry => entry.chunkId));

        expect(state.entries).toHaveLength(EMBEDDING_POISON_MAX_ENTRIES);
        expect(retainedIds.has(offered[0].chunkId)).toBe(false);
        expect(retainedIds.has(offered.at(-1).chunkId)).toBe(true);
    });

    test('clear is the explicit replay path', async () => {
        const {dir, scopeId} = await fixture();

        expect(await readEmbeddingPoisonState({dir, scopeId, generationId: GENERATION}))
            .toEqual({status: 'missing', entries: []});

        await upsertEmbeddingPoisonEntries({
            dir,
            scopeId,
            generationId: GENERATION,
            entries     : [{chunkId: hash('replay-me'), reasonCode: REASON_CODE}]
        });

        expect(await clearEmbeddingPoisonState({dir, scopeId})).toBe(true);
        expect(await readEmbeddingPoisonState({dir, scopeId, generationId: GENERATION}))
            .toEqual({status: 'missing', entries: []});
        expect(await clearEmbeddingPoisonState({dir, scopeId})).toBe(false);
    });

    test('clear is ordered after an in-flight upsert and cannot be recreated by that older write', async () => {
        const {dir, scopeId} = await fixture();
        const pending        = upsertEmbeddingPoisonEntries({
            dir,
            scopeId,
            generationId: GENERATION,
            entries     : [{chunkId: hash('ordered-replay'), reasonCode: REASON_CODE}]
        });

        const cleared = clearEmbeddingPoisonState({dir, scopeId});

        await expect(pending).resolves.toMatchObject({status: 'available'});
        await expect(cleared).resolves.toBe(true);
        await expect(readEmbeddingPoisonState({dir, scopeId, generationId: GENERATION}))
            .resolves.toEqual({status: 'missing', entries: []});
    });
});
