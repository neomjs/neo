import {test, expect} from '@playwright/test';
import fs             from 'node:fs/promises';
import os             from 'node:os';
import path           from 'node:path';
import {
    VECTOR_GENERATION_ELECTION_SCHEMA_VERSION,
    VECTOR_GENERATION_ELECTION_SUBDIR,
    VECTOR_PLANE_COLLECTION_KEYS,
    acceptVectorGenerationElection,
    assertCapturedPromoteView,
    assertVectorPromoteAdmissible,
    captureVectorPromoteView,
    commitVectorGenerationElection,
    createEmbeddingGenerationId,
    createVectorGenerationIdentity,
    declareBaselineVectorGeneration,
    declareCandidateVectorGeneration,
    getVectorGenerationElectionFilePath,
    projectVectorGenerationHealth,
    readVectorGenerationElection,
    recordCandidateValidationReceipt,
    recordPromoteCompletion,
    recordUnparkCompletion,
    renewTransitionQuiesce,
    resolveVectorGenerationElectionDir,
    rollbackVectorGenerationElection
} from '../../../../../../../ai/services/shared/vector/generationElectionStore.mjs';
import {createEmbeddingGenerationId as poisonStoreGenerationId}
    from '../../../../../../../ai/services/knowledge-base/helpers/kbEmbeddingPoisonStore.mjs';

const T0 = new Date('2026-08-12T12:00:00.000Z');
const T1 = new Date('2026-08-12T12:05:00.000Z');
const T2 = new Date('2026-08-12T12:10:00.000Z');
const T3 = new Date('2026-08-12T12:20:00.000Z');

// One hour from T2 — transition fixtures pass explicit `now` values inside/outside this window.
const QUIESCE = Object.freeze({scope: 'fixture-plane-quiesce', boundMs: 60 * 60 * 1000});

const DIGEST_MODEL = 'hf://Qwen/Qwen3-Embedding-8B-GGUF@69d0e58a13e463cd99a9b83e3f5fee7c10265fab/Qwen3-Embedding-8B-Q4_K_M.gguf';

function coordinates(overrides = {}) {
    return {
        provider       : 'ollama',
        model          : DIGEST_MODEL,
        quantization   : 'q4_K_M',
        vectorDimension: 4096,
        pooling        : 'last-token',
        distance       : 'cosine',
        strategyVersion: 'v1',
        ...overrides
    }
}

function receiptFor(key) {
    return {candidateCollection: `shadow-${key}`, rowCount: 104000}
}

async function makeDir() {
    return await fs.mkdtemp(path.join(os.tmpdir(), 'generation-election-'))
}

/**
 * Drives a fresh plane to a committed election of `next` over a baseline of `base`.
 * Returns the committed record (epoch 2, status 'committed', quiesce window open from T2).
 */
async function commitTransition(dir, base, next) {
    await declareBaselineVectorGeneration({dir, identity: base, now: T0});
    await declareCandidateVectorGeneration({dir, identity: next, expectedEpoch: 1, now: T1});

    for (const key of VECTOR_PLANE_COLLECTION_KEYS) {
        await recordCandidateValidationReceipt({dir, collectionKey: key, receipt: receiptFor(key), expectedEpoch: 1, now: T1})
    }

    return await commitVectorGenerationElection({dir, expectedEpoch: 1, quiesce: QUIESCE, now: T2})
}

test.describe('generationElectionStore — one durable authority for vector-plane generation visibility', () => {
    let dir, base, next;

    test.beforeEach(async () => {
        dir  = await makeDir();
        base = createVectorGenerationIdentity(coordinates());
        next = createVectorGenerationIdentity(coordinates({provider: 'openAiCompatible', quantization: 'none'}))
    });

    test.afterEach(async () => {
        await fs.rm(dir, {recursive: true, force: true})
    });

    test.describe('generation identity', () => {
        test('the same coordinate tuple always yields the same ids; any coordinate change yields a new generation', () => {
            const again = createVectorGenerationIdentity(coordinates());

            expect(again.generationId).toBe(base.generationId);
            expect(again.embeddingGenerationId).toBe(base.embeddingGenerationId);

            for (const [key, value] of Object.entries({
                provider       : 'openAiCompatible',
                model          : 'ollama://registry.ollama.ai/library/other:1b@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                quantization   : 'q8_0',
                vectorDimension: 1024,
                pooling        : 'mean',
                distance       : 'l2',
                strategyVersion: 'v2'
            })) {
                const changed = createVectorGenerationIdentity(coordinates({[key]: value}));
                expect(changed.generationId, `changing ${key} must produce a new generation`).not.toBe(base.generationId)
            }
        });

        test('the embedding join key is one id-space with the poison store re-export', () => {
            const tuple = {provider: 'ollama', model: DIGEST_MODEL, vectorDimension: 4096, strategyVersion: 'v1'};

            expect(createEmbeddingGenerationId(tuple)).toBe(poisonStoreGenerationId(tuple));
            expect(base.embeddingGenerationId).toBe(poisonStoreGenerationId(tuple))
        });

        test('placeholder coordinates and mutable model tags are refused at declaration time', () => {
            expect(() => createVectorGenerationIdentity(coordinates({pooling: 'unknown'}))).toThrow(/placeholder/);
            expect(() => createVectorGenerationIdentity(coordinates({quantization: 'TBD'}))).toThrow(/placeholder/);
            expect(() => createVectorGenerationIdentity(coordinates({distance: 'n/a'}))).toThrow(/placeholder/);
            expect(() => createVectorGenerationIdentity(coordinates({model: 'qwen3-embedding:8b'}))).toThrow(/digest-bearing/)
        });

        test('incomplete or invalid coordinates are refused', () => {
            expect(() => createVectorGenerationIdentity(coordinates({pooling: ''}))).toThrow(/pooling/);
            expect(() => createVectorGenerationIdentity(coordinates({vectorDimension: 0}))).toThrow(/vectorDimension/);
            expect(() => createVectorGenerationIdentity({provider: 'ollama'})).toThrow()
        })
    });

    test.describe('fail-safe polarity', () => {
        test('a plane with no record grandfathers promotes in declared legacy mode', async () => {
            await expect(assertVectorPromoteAdmissible({
                dir, collectionKey: 'kb.unified', generationId: base.generationId, epoch: 1, now: T0
            })).resolves.toEqual({mode: 'legacy'})
        });

        test('a corrupt record refuses every promote while reads report unavailable', async () => {
            await declareBaselineVectorGeneration({dir, identity: base, now: T0});
            await fs.writeFile(getVectorGenerationElectionFilePath({dir}), '{not json');

            expect((await readVectorGenerationElection({dir})).status).toBe('unavailable');
            expect((await projectVectorGenerationHealth({dir})).status).toBe('unavailable');

            for (const key of VECTOR_PLANE_COLLECTION_KEYS) {
                await expect(assertVectorPromoteAdmissible({
                    dir, collectionKey: key, generationId: base.generationId, epoch: 1, now: T0
                })).rejects.toThrow(/unprovable/)
            }
        });

        test('a hand-edited identity fails the derived-hash consistency check and reads as unavailable', async () => {
            await declareBaselineVectorGeneration({dir, identity: base, now: T0});

            const filePath = getVectorGenerationElectionFilePath({dir});
            const record   = JSON.parse(await fs.readFile(filePath, 'utf8'));

            record.elected.coordinates.model = 'tampered@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
            await fs.writeFile(filePath, JSON.stringify(record, null, 2));

            expect((await readVectorGenerationElection({dir})).status).toBe('unavailable')
        });

        test('baseline declaration refuses to overwrite ANY existing record, including a corrupt one', async () => {
            await declareBaselineVectorGeneration({dir, identity: base, now: T0});
            await expect(declareBaselineVectorGeneration({dir, identity: next, now: T1}))
                .rejects.toThrow(/already exists/);

            await fs.writeFile(getVectorGenerationElectionFilePath({dir}), '{broken');
            await expect(declareBaselineVectorGeneration({dir, identity: next, now: T1}))
                .rejects.toThrow(/already exists/)
        })
    });

    test.describe('the election lifecycle', () => {
        test('baseline records reality at epoch 1, already accepted, with no quiesce window', async () => {
            const record = await declareBaselineVectorGeneration({dir, identity: base, now: T0});

            expect(record).toMatchObject({
                schemaVersion: VECTOR_GENERATION_ELECTION_SCHEMA_VERSION,
                epoch        : 1,
                status       : 'accepted',
                parked       : null,
                candidate    : null,
                retired      : null,
                quiesce      : null
            });
            expect(record.elected.generationId).toBe(base.generationId);
            expect(Object.keys(record.collections).sort()).toEqual([...VECTOR_PLANE_COLLECTION_KEYS].sort())
        });

        test('a no-op candidate equal to the elected generation is refused as a caller bug', async () => {
            await declareBaselineVectorGeneration({dir, identity: base, now: T0});
            await expect(declareCandidateVectorGeneration({dir, identity: base, expectedEpoch: 1, now: T1}))
                .rejects.toThrow(/no-op election/)
        });

        test('commit refuses until EVERY census collection carries a validation receipt', async () => {
            await declareBaselineVectorGeneration({dir, identity: base, now: T0});
            await declareCandidateVectorGeneration({dir, identity: next, expectedEpoch: 1, now: T1});

            for (const key of VECTOR_PLANE_COLLECTION_KEYS.slice(0, -1)) {
                await recordCandidateValidationReceipt({dir, collectionKey: key, receipt: receiptFor(key), expectedEpoch: 1, now: T1})
            }

            const missing = VECTOR_PLANE_COLLECTION_KEYS.at(-1);
            await expect(commitVectorGenerationElection({dir, expectedEpoch: 1, quiesce: QUIESCE, now: T2}))
                .rejects.toThrow(new RegExp(missing.replace('.', '\\.')))
        });

        test('commit refuses without a declared quiesce window', async () => {
            await declareBaselineVectorGeneration({dir, identity: base, now: T0});
            await declareCandidateVectorGeneration({dir, identity: next, expectedEpoch: 1, now: T1});

            for (const key of VECTOR_PLANE_COLLECTION_KEYS) {
                await recordCandidateValidationReceipt({dir, collectionKey: key, receipt: receiptFor(key), expectedEpoch: 1, now: T1})
            }

            await expect(commitVectorGenerationElection({dir, expectedEpoch: 1, now: T2}))
                .rejects.toThrow(/quiesce must declare/);
            await expect(commitVectorGenerationElection({dir, expectedEpoch: 1, quiesce: {scope: 'x', boundMs: 0}, now: T2}))
                .rejects.toThrow(/quiesce failed validation/)
        });

        test('a receipt with unknown keys or an unknown collection is refused', async () => {
            await declareBaselineVectorGeneration({dir, identity: base, now: T0});
            await declareCandidateVectorGeneration({dir, identity: next, expectedEpoch: 1, now: T1});

            await expect(recordCandidateValidationReceipt({
                dir, collectionKey: 'kb.unified',
                receipt      : {candidateCollection: 'x', rowCount: 1, extra: true},
                expectedEpoch: 1, now: T1
            })).rejects.toThrow(/only candidateCollection, rowCount/);

            await expect(recordCandidateValidationReceipt({
                dir, collectionKey: 'kb.wrong', receipt: receiptFor('kb.wrong'), expectedEpoch: 1, now: T1
            })).rejects.toThrow(/collectionKey/)
        });

        test('commit parks the prior generation, elects the candidate, bumps the epoch, and stores the window', async () => {
            const record = await commitTransition(dir, base, next);

            expect(record).toMatchObject({epoch: 2, status: 'committed', candidate: null});
            expect(record.elected.generationId).toBe(next.generationId);
            expect(record.parked.generationId).toBe(base.generationId);
            expect(record.quiesce).toMatchObject({scope: QUIESCE.scope, boundMs: QUIESCE.boundMs, startedAt: T2.toISOString()});

            for (const key of VECTOR_PLANE_COLLECTION_KEYS) {
                expect(record.collections[key].receipt).not.toBeNull();
                expect(record.collections[key].promotedAt).toBeNull()
            }
        });

        test('acceptance refuses until every collection reports its promote, then retires the parked set and clears the window', async () => {
            await commitTransition(dir, base, next);

            await recordPromoteCompletion({dir, collectionKey: 'kb.unified', expectedEpoch: 2, now: T2});
            await expect(acceptVectorGenerationElection({dir, expectedEpoch: 2, now: T2}))
                .rejects.toThrow(/without a completed promote/);

            for (const key of VECTOR_PLANE_COLLECTION_KEYS.slice(1)) {
                await recordPromoteCompletion({dir, collectionKey: key, expectedEpoch: 2, now: T2})
            }

            const record = await acceptVectorGenerationElection({dir, expectedEpoch: 2, now: T2});

            expect(record).toMatchObject({status: 'accepted', epoch: 2, parked: null, quiesce: null});
            expect(record.retired.generationId).toBe(base.generationId);
            expect(record.retiredAt).toBe(T2.toISOString())
        });

        test('every mutation enforces the caller epoch view', async () => {
            await declareBaselineVectorGeneration({dir, identity: base, now: T0});

            await expect(declareCandidateVectorGeneration({dir, identity: next, expectedEpoch: 7, now: T1}))
                .rejects.toThrow(/epoch moved/);

            await declareCandidateVectorGeneration({dir, identity: next, expectedEpoch: 1, now: T1});
            await expect(recordCandidateValidationReceipt({
                dir, collectionKey: 'kb.unified', receipt: receiptFor('kb.unified'), expectedEpoch: 2, now: T1
            })).rejects.toThrow(/epoch moved/)
        })
    });

    test.describe('the stale-writer fence (mixed-generation mutation coverage)', () => {
        test('an uncommitted election never advertises: candidate promotes are refused on every collection', async () => {
            await declareBaselineVectorGeneration({dir, identity: base, now: T0});
            await declareCandidateVectorGeneration({dir, identity: next, expectedEpoch: 1, now: T1});

            for (const key of VECTOR_PLANE_COLLECTION_KEYS) {
                await recordCandidateValidationReceipt({dir, collectionKey: key, receipt: receiptFor(key), expectedEpoch: 1, now: T1});
                await expect(assertVectorPromoteAdmissible({
                    dir, collectionKey: key, generationId: next.generationId, epoch: 1, now: T1
                })).rejects.toThrow(/not the elected generation/)
            }

            await expect(assertVectorPromoteAdmissible({
                dir, collectionKey: 'kb.unified', generationId: base.generationId, epoch: 1, now: T1
            })).resolves.toMatchObject({mode: 'elected', epoch: 1})
        });

        test('after commit, a writer holding the pre-election view is fenced on both coordinates', async () => {
            await commitTransition(dir, base, next);

            await expect(assertVectorPromoteAdmissible({
                dir, collectionKey: 'mc.memory', generationId: base.generationId, epoch: 1, now: T2
            })).rejects.toThrow(/stale writer fenced/);

            await expect(assertVectorPromoteAdmissible({
                dir, collectionKey: 'mc.memory', generationId: base.generationId, epoch: 2, now: T2
            })).rejects.toThrow(/not the elected generation/);

            await expect(assertVectorPromoteAdmissible({
                dir, collectionKey: 'mc.memory', generationId: next.generationId, epoch: 2, now: T2
            })).resolves.toMatchObject({mode: 'elected', epoch: 2, generationId: next.generationId})
        });

        test('a partially-promoted committed election cannot be accepted and stays rollback-covered', async () => {
            await commitTransition(dir, base, next);

            await recordPromoteCompletion({dir, collectionKey: 'kb.unified', expectedEpoch: 2, now: T2});
            await recordPromoteCompletion({dir, collectionKey: 'mc.memory', expectedEpoch: 2, now: T2});

            await expect(acceptVectorGenerationElection({dir, expectedEpoch: 2, now: T2}))
                .rejects.toThrow(/without a completed promote/);

            const record = (await readVectorGenerationElection({dir})).record;
            expect(record.parked.generationId).toBe(base.generationId)
        })
    });

    test.describe('the quiesce window bounds every transition rename', () => {
        test('a transition promote refuses outside the declared window and resumes after an explicit renewal', async () => {
            await commitTransition(dir, base, next);

            // Inside the T2 + 1h window: admissible.
            await expect(assertVectorPromoteAdmissible({
                dir, collectionKey: 'kb.unified', generationId: next.generationId, epoch: 2, now: T2
            })).resolves.toMatchObject({mode: 'elected'});

            // Beyond the window (T2 + 2h): the rename refuses with the renewal remediation named.
            const late = new Date(T2.getTime() + 2 * 60 * 60 * 1000);
            await expect(assertVectorPromoteAdmissible({
                dir, collectionKey: 'kb.unified', generationId: next.generationId, epoch: 2, now: late
            })).rejects.toThrow(/outside the declared quiesce window/);

            // Renewal is explicit and receipted; the same rename is admissible again.
            await renewTransitionQuiesce({dir, expectedEpoch: 2, quiesce: {scope: 'renewed-window', boundMs: QUIESCE.boundMs, startedAt: late}, now: late});
            await expect(assertVectorPromoteAdmissible({
                dir, collectionKey: 'kb.unified', generationId: next.generationId, epoch: 2, now: late
            })).resolves.toMatchObject({mode: 'elected'})
        });

        test('renewal is only reachable for a running transition', async () => {
            await declareBaselineVectorGeneration({dir, identity: base, now: T0});
            await expect(renewTransitionQuiesce({dir, expectedEpoch: 1, quiesce: QUIESCE, now: T1}))
                .rejects.toThrow(/only a running transition/)
        });

        test('steady-state refresh promotes need no window', async () => {
            await declareBaselineVectorGeneration({dir, identity: base, now: T0});

            // Years later, no transition running — a same-generation refresh promote is admissible.
            const muchLater = new Date('2027-01-01T00:00:00.000Z');
            await expect(assertVectorPromoteAdmissible({
                dir, collectionKey: 'kb.unified', generationId: base.generationId, epoch: 1, now: muchLater
            })).resolves.toMatchObject({mode: 'elected', electionStatus: 'accepted'})
        })
    });

    test.describe('rollback restores the full prior set', () => {
        test('rollback re-elects the parked generation under its own declared window and fences the abandoned writers', async () => {
            await commitTransition(dir, base, next);
            await recordPromoteCompletion({dir, collectionKey: 'kb.unified', expectedEpoch: 2, now: T2});

            await expect(rollbackVectorGenerationElection({dir, expectedEpoch: 2, now: T3}))
                .rejects.toThrow(/quiesce must declare/);

            const record = await rollbackVectorGenerationElection({dir, expectedEpoch: 2, quiesce: {scope: 'rollback-window', boundMs: QUIESCE.boundMs}, now: T3});

            expect(record).toMatchObject({epoch: 3, status: 'rolled-back', parked: null, committedAt: null});
            expect(record.elected.generationId).toBe(base.generationId);
            expect(record.rolledBack.generationId).toBe(next.generationId);
            expect(record.quiesce).toMatchObject({scope: 'rollback-window', startedAt: T3.toISOString()});

            for (const key of VECTOR_PLANE_COLLECTION_KEYS) {
                expect(record.collections[key].promotedAt, `${key} promote is void after rollback`).toBeNull()
            }

            // The abandoned generation cannot rename at any epoch; the restored one can, inside the window.
            await expect(assertVectorPromoteAdmissible({
                dir, collectionKey: 'kb.unified', generationId: next.generationId, epoch: 3, now: T3
            })).rejects.toThrow(/not the elected generation/);
            await expect(assertVectorPromoteAdmissible({
                dir, collectionKey: 'kb.unified', generationId: base.generationId, epoch: 3, now: T3
            })).resolves.toMatchObject({mode: 'elected', epoch: 3});

            // Un-park renames refuse outside the rollback window too — the defect cannot recur in reverse.
            const late = new Date(T3.getTime() + 2 * 60 * 60 * 1000);
            await expect(assertVectorPromoteAdmissible({
                dir, collectionKey: 'kb.unified', generationId: base.generationId, epoch: 3, now: late
            })).rejects.toThrow(/outside the declared quiesce window/)
        });

        test('rollback is only reachable before acceptance — a code-only rollback without the generation restore cannot exist', async () => {
            await commitTransition(dir, base, next);

            for (const key of VECTOR_PLANE_COLLECTION_KEYS) {
                await recordPromoteCompletion({dir, collectionKey: key, expectedEpoch: 2, now: T2})
            }
            await acceptVectorGenerationElection({dir, expectedEpoch: 2, now: T2});

            await expect(rollbackVectorGenerationElection({dir, expectedEpoch: 2, quiesce: QUIESCE, now: T2}))
                .rejects.toThrow(/only a committed, unaccepted election rolls back/)
        });

        test('a new candidate is refused until every collection reports its un-park', async () => {
            await commitTransition(dir, base, next);
            await rollbackVectorGenerationElection({dir, expectedEpoch: 2, quiesce: QUIESCE, now: T2});

            const third = createVectorGenerationIdentity(coordinates({strategyVersion: 'v3'}));

            await expect(declareCandidateVectorGeneration({dir, identity: third, expectedEpoch: 3, now: T2}))
                .rejects.toThrow(/never reported their un-park/);

            for (const key of VECTOR_PLANE_COLLECTION_KEYS) {
                await recordUnparkCompletion({dir, collectionKey: key, expectedEpoch: 3, now: T2})
            }

            const record = await declareCandidateVectorGeneration({dir, identity: third, expectedEpoch: 3, now: T2});
            expect(record.status).toBe('candidate');
            expect(record.rolledBack).toBeNull();
            expect(record.quiesce).toBeNull()
        })
    });

    test.describe('health projection', () => {
        test('health reports elected + parked identities, the window, and per-collection state without throwing', async () => {
            expect((await projectVectorGenerationHealth({dir})).status).toBe('missing');

            await commitTransition(dir, base, next);
            await recordPromoteCompletion({dir, collectionKey: 'kb.unified', expectedEpoch: 2, now: T2});

            const health = await projectVectorGenerationHealth({dir});

            expect(health.status).toBe('committed');
            expect(health.epoch).toBe(2);
            expect(health.elected.generationId).toBe(next.generationId);
            expect(health.parked.generationId).toBe(base.generationId);
            expect(health.quiesce).toMatchObject({scope: QUIESCE.scope});
            expect(health.elected.coordinates.provider).toBe('openAiCompatible');
            expect(health.collections['kb.unified']).toMatchObject({validated: true});
            expect(health.collections['kb.unified'].promotedAt).not.toBeNull();
            expect(health.collections['mc.graph'].promotedAt).toBeNull();
            expect(health.collections['mc.session'].promotedAt).toBeNull()
        })
    });

    test.describe('the seam-facing captured view', () => {
        test('the election dir resolves beneath the plane data root with the shared subpath', () => {
            expect(resolveVectorGenerationElectionDir({planeDataRoot: '/plane'}))
                .toBe(path.resolve('/plane', VECTOR_GENERATION_ELECTION_SUBDIR));
            expect(() => resolveVectorGenerationElectionDir({})).toThrow(/planeDataRoot/)
        });

        test('a legacy view stays admissible only while the plane still has no record', async () => {
            const view = await captureVectorPromoteView({dir});

            expect(view).toEqual({mode: 'legacy'});
            await expect(assertCapturedPromoteView({dir, collectionKey: 'kb.unified', view}))
                .resolves.toEqual({mode: 'legacy'});

            await declareBaselineVectorGeneration({dir, identity: base, now: T0});
            await expect(assertCapturedPromoteView({dir, collectionKey: 'kb.unified', view}))
                .rejects.toThrow(/declared after this writer began/)
        });

        test('an elected view delegates to the fence and goes stale the moment a transition commits', async () => {
            await declareBaselineVectorGeneration({dir, identity: base, now: T0});

            const view = await captureVectorPromoteView({dir});

            expect(view).toMatchObject({mode: 'elected', generationId: base.generationId, epoch: 1, electionStatus: 'accepted'});
            await expect(assertCapturedPromoteView({dir, collectionKey: 'mc.memory', view}))
                .resolves.toMatchObject({mode: 'elected', epoch: 1, electionStatus: 'accepted'});

            await declareCandidateVectorGeneration({dir, identity: next, expectedEpoch: 1, now: T1});
            for (const key of VECTOR_PLANE_COLLECTION_KEYS) {
                await recordCandidateValidationReceipt({dir, collectionKey: key, receipt: receiptFor(key), expectedEpoch: 1, now: T1})
            }
            await commitVectorGenerationElection({dir, expectedEpoch: 1, quiesce: QUIESCE, now: T2});

            await expect(assertCapturedPromoteView({dir, collectionKey: 'mc.memory', view}))
                .rejects.toThrow(/stale writer fenced/)
        });

        test('capture refuses to start a build on an unprovable record', async () => {
            await declareBaselineVectorGeneration({dir, identity: base, now: T0});
            await fs.writeFile(getVectorGenerationElectionFilePath({dir}), '{broken');

            await expect(captureVectorPromoteView({dir})).rejects.toThrow(/unprovable/);
            await expect(assertCapturedPromoteView({dir, collectionKey: 'kb.unified', view: {mode: 'legacy'}}))
                .rejects.toThrow(/unprovable/)
        })
    });

    test.describe('durability shape', () => {
        test('the record round-trips through disk and revalidates on every read', async () => {
            await commitTransition(dir, base, next);

            const reread = await readVectorGenerationElection({dir});

            expect(reread.status).toBe('available');
            expect(reread.record.elected.generationId).toBe(next.generationId);

            const raw = JSON.parse(await fs.readFile(getVectorGenerationElectionFilePath({dir}), 'utf8'));
            expect(raw.schemaVersion).toBe(VECTOR_GENERATION_ELECTION_SCHEMA_VERSION);
            expect(Object.keys(raw.collections).sort()).toEqual([...VECTOR_PLANE_COLLECTION_KEYS].sort());
            expect(raw.quiesce.scope).toBe(QUIESCE.scope)
        })
    })
});
