import {test, expect} from '@playwright/test';
import fs             from 'node:fs/promises';
import os             from 'node:os';
import path           from 'node:path';
import {
    promoteCollectionUnderElection,
    reconcileInterruptedPromote,
    unparkCollectionUnderElection
} from '../../../../../../../ai/services/shared/vector/electionGatedPromote.mjs';
import {
    VECTOR_PLANE_COLLECTION_KEYS,
    acceptVectorGenerationElection,
    captureVectorPromoteView,
    commitVectorGenerationElection,
    createVectorGenerationIdentity,
    declareBaselineVectorGeneration,
    declareCandidateVectorGeneration,
    readVectorGenerationElection,
    recordCandidateValidationReceipt,
    recordUnparkCompletion,
    rollbackVectorGenerationElection
} from '../../../../../../../ai/services/shared/vector/generationElectionStore.mjs';

const T0 = new Date('2026-08-12T12:00:00.000Z');
const T1 = new Date('2026-08-12T12:05:00.000Z');
const T2 = new Date('2026-08-12T12:10:00.000Z');

const QUIESCE     = Object.freeze({scope: 'physical-matrix-quiesce', boundMs: 60 * 60 * 1000});
const AFTER_CLOSE = new Date(T2.getTime() + 2 * 60 * 60 * 1000);

const DIGEST_MODEL_G1 = 'hf://fixture/G1@sha256:1111111111111111111111111111111111111111111111111111111111111111';
const DIGEST_MODEL_G2 = 'hf://fixture/G2@sha256:2222222222222222222222222222222222222222222222222222222222222222';

function identityFor(model) {
    return createVectorGenerationIdentity({
        provider       : 'openAiCompatible',
        model,
        quantization   : 'q4_K_M',
        vectorDimension: 8,
        pooling        : 'last-token',
        distance       : 'cosine',
        strategyVersion: 'v1'
    })
}

/**
 * Minimal name-resolving Chroma-shaped client: collections live in one name→object map and
 * `modify({name})` performs a REAL rename, so reading a canonical NAME after each transition step
 * observes exactly what a production reader resolving that name would observe.
 */
function createFakeChromaClient() {
    const collections = new Map();

    async function createCollection({name, marker}) {
        if (collections.has(name)) {
            throw new Error(`collection '${name}' already exists`)
        }

        const collection = {
            marker,
            async modify({name: nextName}) {
                if (collections.has(nextName)) {
                    throw new Error(`collection '${nextName}' already exists`)
                }

                for (const [key, value] of collections.entries()) {
                    if (value === collection) {
                        collections.delete(key)
                    }
                }

                collections.set(nextName, collection)
            }
        };

        collections.set(name, collection);
        return collection
    }

    return {
        createCollection,
        getCollection: async name => collections.get(name) ?? null,
        readMarker   : name => collections.get(name)?.marker ?? null,
        names        : () => [...collections.keys()].sort()
    }
}

function canonicalName(key) {
    return `canonical-${key}`
}

/** Reads the generation marker every reader would observe at each canonical name. */
function readPlane(client) {
    return Object.fromEntries(VECTOR_PLANE_COLLECTION_KEYS.map(key => [key, client.readMarker(canonicalName(key))]))
}

async function seedPlane(client) {
    for (const key of VECTOR_PLANE_COLLECTION_KEYS) {
        await client.createCollection({name: canonicalName(key), marker: 'G1'});
        await client.createCollection({name: `shadow-${key}`, marker: 'G2'})
    }
}

async function commitTransition(dir) {
    const g1 = identityFor(DIGEST_MODEL_G1);
    const g2 = identityFor(DIGEST_MODEL_G2);

    await declareBaselineVectorGeneration({dir, identity: g1, now: T0});
    await declareCandidateVectorGeneration({dir, identity: g2, expectedEpoch: 1, now: T1});

    for (const key of VECTOR_PLANE_COLLECTION_KEYS) {
        await recordCandidateValidationReceipt({
            dir, collectionKey: key,
            receipt      : {candidateCollection: `shadow-${key}`, rowCount: 1},
            expectedEpoch: 1, now: T1
        })
    }

    await commitVectorGenerationElection({dir, expectedEpoch: 1, quiesce: QUIESCE, now: T2});
    return {g1, g2}
}

function promoteArgs(client, dir, key, view, now) {
    return {
        getCollection: client.getCollection,
        canonicalName: canonicalName(key),
        shadowName   : `shadow-${key}`,
        parkingName  : `parking-${key}`,
        dir,
        collectionKey: key,
        view,
        now
    }
}

test.describe('electionGatedPromote — the physical halt/crash matrix (#17023)', () => {
    let dir, client;

    test.beforeEach(async () => {
        dir    = await fs.mkdtemp(path.join(os.tmpdir(), 'election-gated-promote-'));
        client = createFakeChromaClient();
        await seedPlane(client)
    });

    test.afterEach(async () => {
        await fs.rm(dir, {recursive: true, force: true})
    });

    test('halted mid-transition, every canonical name reads exactly the declared mixed set — bounded, refused outside the window, rollback-covered, and fully restored', async () => {
        await commitTransition(dir);

        const view = await captureVectorPromoteView({dir});

        // Step 0 — committed, zero renames: every reader still resolves G1.
        expect(readPlane(client)).toEqual(Object.fromEntries(VECTOR_PLANE_COLLECTION_KEYS.map(key => [key, 'G1'])));

        // Steps 1+2 — promote two collections inside the window, then HALT (simulated crash: no
        // further calls). Read every physical canonical name.
        await promoteCollectionUnderElection(promoteArgs(client, dir, 'kb.unified', view, T2));
        await promoteCollectionUnderElection(promoteArgs(client, dir, 'mc.memory', view, T2));

        expect(readPlane(client)).toEqual({
            'kb.unified'        : 'G2',
            'mc.memory'         : 'G2',
            'mc.graph'          : 'G1',
            'mc.session'        : 'G1',
            'mc.temporalSummary': 'G1'
        });

        // The halted state cannot be accepted (partial promotion) and stays rollback-covered.
        await expect(acceptVectorGenerationElection({dir, expectedEpoch: 2, now: T2}))
            .rejects.toThrow(/without a completed promote/);
        expect((await readVectorGenerationElection({dir})).record.parked).not.toBeNull();

        // The mixed interval cannot GROW outside the declared window: the next promote refuses.
        await expect(promoteCollectionUnderElection(promoteArgs(client, dir, 'mc.session', view, AFTER_CLOSE)))
            .rejects.toThrow(/outside the declared quiesce window/);
        expect(client.readMarker(canonicalName('mc.session'))).toBe('G1');

        // Rollback under its own declared window re-elects G1 and fences the abandoned generation.
        await rollbackVectorGenerationElection({
            dir, expectedEpoch: 2,
            quiesce: {scope: 'rollback-window', boundMs: QUIESCE.boundMs, startedAt: AFTER_CLOSE},
            now    : AFTER_CLOSE
        });

        const rollbackView = await captureVectorPromoteView({dir});

        // A promote of the abandoned generation's shadow refuses at the fence.
        await expect(promoteCollectionUnderElection(promoteArgs(client, dir, 'mc.session', view, AFTER_CLOSE)))
            .rejects.toThrow(/stale writer fenced/);

        // Un-park the two promoted collections; the abandoned G2 canonicals move aside first.
        for (const key of ['kb.unified', 'mc.memory']) {
            const result = await unparkCollectionUnderElection({
                getCollection: client.getCollection,
                canonicalName: canonicalName(key),
                parkingName  : `parking-${key}`,
                abandonedName: `abandoned-${key}`,
                dir,
                collectionKey: key,
                view         : rollbackView,
                now          : AFTER_CLOSE
            });

            expect(result.movedAbandonedTo).toBe(`abandoned-${key}`);
            expect(result.completionRecorded).toBe(true)
        }

        // Never-promoted collections have nothing to un-park; the runner records them directly.
        for (const key of ['mc.graph', 'mc.session', 'mc.temporalSummary']) {
            await recordUnparkCompletion({dir, collectionKey: key, expectedEpoch: 3, now: AFTER_CLOSE})
        }

        // Every physical canonical name reads G1 again — the FULL prior set, by observation.
        expect(readPlane(client)).toEqual(Object.fromEntries(VECTOR_PLANE_COLLECTION_KEYS.map(key => [key, 'G1'])));

        // And the plane can move on: the next candidate is declarable only now.
        const g3 = identityFor('hf://fixture/G3@sha256:3333333333333333333333333333333333333333333333333333333333333333');
        await expect(declareCandidateVectorGeneration({dir, identity: g3, expectedEpoch: 3, now: AFTER_CLOSE}))
            .resolves.toMatchObject({status: 'candidate'})
    });

    test('a crash between the two renames restores the canonical name before rethrowing', async () => {
        await commitTransition(dir);

        const view   = await captureVectorPromoteView({dir});
        const shadow = await client.getCollection('shadow-kb.unified');
        const modify = shadow.modify.bind(shadow);

        shadow.modify = async () => {
            throw new Error('simulated crash between renames')
        };

        await expect(promoteCollectionUnderElection(promoteArgs(client, dir, 'kb.unified', view, T2)))
            .rejects.toThrow(/simulated crash/);

        // The canonical name is served again (G1), no parking residue blocks a retry.
        expect(client.readMarker(canonicalName('kb.unified'))).toBe('G1');
        expect(await client.getCollection('parking-kb.unified')).toBeNull();

        shadow.modify = modify;
        await promoteCollectionUnderElection(promoteArgs(client, dir, 'kb.unified', view, T2));
        expect(client.readMarker(canonicalName('kb.unified'))).toBe('G2')
    });

    test('a legacy plane promotes ungated and records nothing', async () => {
        const view   = await captureVectorPromoteView({dir});
        const result = await promoteCollectionUnderElection(promoteArgs(client, dir, 'kb.unified', view, T0));

        expect(result.admission).toEqual({mode: 'legacy'});
        expect(result.completionRecorded).toBe(false);
        expect(client.readMarker(canonicalName('kb.unified'))).toBe('G2');
        expect((await readVectorGenerationElection({dir})).status).toBe('missing')
    });

    test('an expiry between the two renames refuses at the second fence and restores the canonical name', async () => {
        await commitTransition(dir);

        const view = await captureVectorPromoteView({dir});
        // Stepping clock: the first fence reads inside the window, the second reads beyond it —
        // the exact interruption class no single-timestamp check can observe.
        let   calls = 0;
        const clock = () => (calls++ === 0 ? T2 : AFTER_CLOSE);

        await expect(promoteCollectionUnderElection(promoteArgs(client, dir, 'kb.unified', view, clock)))
            .rejects.toThrow(/outside the declared quiesce window/);

        // The first rename happened and was rolled back: canonical serves G1, no parking residue.
        expect(client.readMarker(canonicalName('kb.unified'))).toBe('G1');
        expect(await client.getCollection('parking-kb.unified')).toBeNull()
    });

    test('reconcile resumes a promote killed between its renames — or restores the prior when the candidate is gone', async () => {
        await commitTransition(dir);

        const view = await captureVectorPromoteView({dir});

        // Manufacture the SIGKILL state: the first rename ran (canonical → parking), the process
        // died before the second — no in-process finally ever saw it.
        const live = await client.getCollection(canonicalName('kb.unified'));
        await live.modify({name: 'parking-kb.unified'});
        expect(client.readMarker(canonicalName('kb.unified'))).toBeNull();

        // A blind promote retry refuses and names the remediation.
        await expect(promoteCollectionUnderElection(promoteArgs(client, dir, 'kb.unified', view, T2)))
            .rejects.toThrow(/run reconcileInterruptedPromote/);

        // The reconcile completes the interrupted second rename under the fence.
        const resumed = await reconcileInterruptedPromote({
            getCollection: client.getCollection,
            canonicalName: canonicalName('kb.unified'),
            shadowName   : 'shadow-kb.unified',
            parkingName  : 'parking-kb.unified',
            dir,
            collectionKey: 'kb.unified',
            view,
            now          : T2
        });

        expect(resumed.status).toBe('resumed-promote');
        expect(resumed.completionRecorded).toBe(true);
        expect(client.readMarker(canonicalName('kb.unified'))).toBe('G2');

        // Second flavor on another collection: the interrupted state with the CANDIDATE gone —
        // reconcile restores the prior corpus and reports nothing (transition stays incomplete).
        const live2 = await client.getCollection(canonicalName('mc.memory'));
        await live2.modify({name: 'parking-mc.memory'});
        const deadShadow = await client.getCollection('shadow-mc.memory');
        await deadShadow.modify({name: 'discarded-mc.memory'});

        const restored = await reconcileInterruptedPromote({
            getCollection: client.getCollection,
            canonicalName: canonicalName('mc.memory'),
            shadowName   : 'shadow-mc.memory',
            parkingName  : 'parking-mc.memory',
            dir,
            collectionKey: 'mc.memory',
            view,
            now          : T2
        });

        expect(restored.status).toBe('restored-prior');
        expect(restored.completionRecorded).toBe(false);
        expect(client.readMarker(canonicalName('mc.memory'))).toBe('G1');

        // Clean state is a no-op; a name with no source anywhere is loud.
        expect((await reconcileInterruptedPromote({
            getCollection: client.getCollection,
            canonicalName: canonicalName('mc.session'),
            shadowName   : 'shadow-mc.session',
            parkingName  : 'parking-mc.session',
            dir, collectionKey: 'mc.session', view, now: T2
        })).status).toBe('clean');

        await expect(reconcileInterruptedPromote({
            getCollection: client.getCollection,
            canonicalName: 'canonical-ghost',
            shadowName   : 'shadow-ghost',
            parkingName  : 'parking-ghost',
            dir, collectionKey: 'mc.graph', view, now: T2
        })).rejects.toThrow(/unrecoverable from names alone/)
    });

    test('preconditions refuse before any rename', async () => {
        await commitTransition(dir);
        const view = await captureVectorPromoteView({dir});

        await client.createCollection({name: 'parking-mc.graph', marker: 'stale'});
        await expect(promoteCollectionUnderElection(promoteArgs(client, dir, 'mc.graph', view, T2)))
            .rejects.toThrow(/parking collection 'parking-mc.graph' already exists/);
        expect(client.readMarker(canonicalName('mc.graph'))).toBe('G1');

        await expect(unparkCollectionUnderElection({
            getCollection: client.getCollection,
            canonicalName: canonicalName('mc.session'),
            parkingName  : 'parking-mc.session',
            dir,
            collectionKey: 'mc.session',
            view,
            now          : T2
        })).rejects.toThrow(/nothing to restore/)
    })
});
