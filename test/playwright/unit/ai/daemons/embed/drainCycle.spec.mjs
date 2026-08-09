import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {mkdtemp, rm}  from 'fs/promises';
import os             from 'os';
import path           from 'path';

import {
    appendWalEmbedMarker,
    appendWalMemory,
    readPendingWalRecords
} from '../../../../../../ai/services/memory-core/helpers/memoryWalStore.mjs';
import {
    drainWalOnce,
    embedBatch,
    getBackoffDelayMs,
    startDrainLoop,
    MAX_RECORD_COOLDOWN_MS
} from '../../../../../../ai/daemons/embed/drainCycle.mjs';
import {createDrainDispositionTracker}          from '../../../../../../ai/daemons/shared/drainDisposition.mjs';
import {OPENAI_COMPATIBLE_REQUEST_TIMEOUT_CODE} from '../../../../../../ai/provider/createTimeoutError.mjs';
import {getProviderActivityContext}             from '../../../../../../ai/services/shared/providerActivityLedger.mjs';

/**
 * Embed-daemon drain cycle (`ai/daemons/embed/drainCycle.mjs`) — falsifier coverage for the
 * durable WAL drain:
 *
 *   AC1 drain/mark/prune — pending records are embedded, marker-reconciled, and reconciled
 *                          segments beyond the retention bound are pruned (seeded JSONL).
 *   Retry/backoff        — transient whole-batch failures retry with exponential backoff up to
 *                          maxRetries before falling back to per-record isolation.
 *   Poison isolation     — one persistently failing record cannot hold the backlog hostage: its
 *                          batch-mates drain, it enters cross-cycle exponential cooldown, and it
 *                          is retried (never abandoned) once the cooldown expires.
 *   AC5 purge safety     — a record tombstoned BEFORE the drain is never re-embedded, and a
 *                          record tombstoned MID-embed (the purge race) is compensated with a
 *                          `collection.delete` instead of a daemon marker (sole-drainer invariant).
 *
 * Pure-node module: every collaborator (collection, clock, sleep, retry state) is injected, so
 * the spec drives the EXACT production drain logic with a fake collection and a virtual clock.
 */
test.describe('Neo.ai.daemons.embed.drainCycle', () => {
    let tmpDir;

    test.beforeEach(async () => {
        tmpDir = await mkdtemp(path.join(os.tmpdir(), 'neo-embed-drain-'));
    });

    test.afterEach(async () => {
        await rm(tmpDir, {recursive: true, force: true});
    });

    const record = (id, timestampMs) => ({
        id,
        timestamp: timestampMs,
        metadata : {prompt: `p-${id}`, sessionId: `session-${id}`, timestamp: timestampMs},
        document : `doc-${id}`
    });

    const seed = async (id, timestampMs = Date.now()) =>
        (await appendWalMemory(record(id, timestampMs), {dir: tmpDir, planeId: 'test-memory-plane'})).segmentKey;

    // The post-add atomic-write verify reads vectors back and classifies them at this dimension.
    const VECTOR_DIMENSION = 4;
    const VALID_VECTOR     = [0.11, 0.22, 0.33, 0.44];

    /**
     * Controllable content-store fake: records every add/get/delete, stores metadata + (simulated
     * auto-embed) vectors by id, and exposes `failNextAdds` (transient whole-batch failures),
     * `failNextGets` (transient verify-read failures), `onAdd` (per-payload hook), and `noVectorFor`
     * — ids whose `add` "succeeds" but persists NO vector, simulating the non-atomic auto-embed that
     * produces the metadata-only corruption row.
     */
    const createFakeCollection = () => {
        const fake = {
            store               : new Map(),
            vectors             : new Map(),
            addCalls            : [],
            getCalls            : [],
            deleteCalls         : [],
            failNextAdds        : 0,
            failNextGets        : 0,
            noVectorFor         : new Set(),
            throwVectorAbsentFor: new Set(),
            onAdd               : null,
            add                 : async payload => {
                fake.addCalls.push(payload);
                if (fake.onAdd) await fake.onAdd(payload);
                if (fake.failNextAdds > 0) {
                    fake.failNextAdds--;
                    throw new Error('store down (spec)');
                }
                payload.ids.forEach((id, i) => {
                    fake.store.set(id, payload.metadatas[i]);
                    // Simulate Chroma auto-embed: a valid vector lands UNLESS this id is marked non-atomic
                    // (metadata persists, vector does not) — the metadata-only corruption shape.
                    if (!fake.noVectorFor.has(id)) fake.vectors.set(id, [...VALID_VECTOR]);
                });
            },
            get: async ({ids}) => {
                fake.getCalls.push(ids);
                if (fake.failNextGets > 0) {
                    fake.failNextGets--;
                    throw new Error('get down (spec)');
                }
                // Model the documented metadata-only read-back: Chroma throws `Error finding id` for a row
                // whose vector never reached the index (rather than returning it with a null embedding).
                const absent = ids.find(id => fake.throwVectorAbsentFor.has(id));
                if (absent) {
                    throw new Error(`Error finding id ${absent} in collection`);
                }
                const present = ids.filter(id => fake.vectors.has(id));
                return {ids: present, embeddings: present.map(id => fake.vectors.get(id))};
            },
            delete: async ({ids}) => {
                fake.deleteCalls.push(ids);
                ids.forEach(id => { fake.store.delete(id); fake.vectors.delete(id); });
            }
        };
        return fake;
    };

    const drain = (collection, options = {}) => drainWalOnce({
        dir           : tmpDir,
        collection,
        batchSize     : 50,
        maxRetries    : 2,
        backoffBaseMs : 1000,
        retentionLimit: 0,
        sleep         : async () => {},
        ...options
    });

    test('AC1: pending records are embedded, marked reconciled, and counted', async () => {
        await seed('a');
        await seed('b');
        await seed('c');

        const collection = createFakeCollection();
        const summary    = await drain(collection);

        expect(summary).toMatchObject({pending: 3, embedded: 3, compensated: 0, failed: 0, cooling: 0});
        expect(collection.addCalls).toHaveLength(1); // whole-batch fast path
        expect([...collection.store.keys()].sort()).toEqual(['a', 'b', 'c']);
        expect(await readPendingWalRecords({dir: tmpDir})).toHaveLength(0);

        // Reconciled means durable: a second cycle finds no work and re-embeds nothing.
        const second = await drain(collection);
        expect(second).toMatchObject({pending: 0, embedded: 0});
        expect(collection.addCalls).toHaveLength(1);
    });

    test('#14228 atomic-write Prevent: an add-success that persisted NO vector (non-atomic auto-embed) is NOT marked embedded — it is deleted + retried', async () => {
        await seed('good');
        await seed('bad');

        const collection = createFakeCollection();
        collection.noVectorFor.add('bad');   // auto-embed persists 'bad' metadata but no vector (the metadata-only shape)

        const retryState = new Map();
        const first      = await drain(collection, {expectedDimension: VECTOR_DIMENSION, retryState, now: () => 5_000_000});

        // 'good' embedded + reconciled; 'bad' detected metadata-only → not marked, deleted, cooling for retry.
        expect(first).toMatchObject({pending: 2, embedded: 1, metadataOnly: 1, failed: 0});
        expect(collection.deleteCalls.flat()).toContain('bad');        // metadata-only row removed for clean re-embed
        expect(collection.store.has('bad')).toBe(false);
        expect(retryState.get('bad')).toMatchObject({failures: 1});
        // 'good' reconciled (not pending); 'bad' stays pending — never marked embedded.
        expect((await readPendingWalRecords({dir: tmpDir})).map(r => r.id)).toEqual(['bad']);

        // Cycle 2: 'bad' now auto-embeds atomically (vector persists) → re-embedded + reconciled.
        collection.noVectorFor.delete('bad');
        const second = await drain(collection, {expectedDimension: VECTOR_DIMENSION, retryState, now: () => 6_000_000});
        expect(second).toMatchObject({embedded: 1, metadataOnly: 0});
        expect(await readPendingWalRecords({dir: tmpDir})).toHaveLength(0);
    });

    test('#14228 atomic-write Prevent: a transient (non-vector-absent) read failure → unverifiable, left pending, NOT deleted', async () => {
        await seed('x');

        const collection = createFakeCollection();
        collection.failNextGets = 2;   // the batch read AND the per-id fallback read both throw a transient error

        const summary = await drain(collection, {expectedDimension: VECTOR_DIMENSION, retryState: new Map(), now: () => 7_000_000});

        expect(summary).toMatchObject({embedded: 0, unverifiable: 1, metadataOnly: 0});
        expect(collection.deleteCalls.flat()).not.toContain('x');   // a transient read error must NOT destroy a possibly-valid row
        expect((await readPendingWalRecords({dir: tmpDir})).map(r => r.id)).toEqual(['x']);   // stays pending for retry
    });

    test('#14228 atomic-write Prevent: a THROWN metadata-only signature (Error finding id) is caught + deleted + retried, not collapsed into transient', async () => {
        await seed('good');
        await seed('bad');

        const collection = createFakeCollection();
        collection.throwVectorAbsentFor.add('bad');   // get throws the documented vector-absent signature for 'bad'

        const retryState = new Map();
        const first      = await drain(collection, {expectedDimension: VECTOR_DIMENSION, retryState, now: () => 8_000_000});

        // The batch read-back throws → per-id fallback isolates: 'good' verifies, 'bad' is the thrown vector-absent
        // signature → confirmed metadata-only → deleted + retried (NOT left as unverifiable).
        expect(first).toMatchObject({embedded: 1, metadataOnly: 1, unverifiable: 0});
        expect(collection.deleteCalls.flat()).toContain('bad');
        expect(retryState.get('bad')).toMatchObject({failures: 1});
        expect((await readPendingWalRecords({dir: tmpDir})).map(r => r.id)).toEqual(['bad']);

        // Cycle 2: 'bad' now reads back cleanly → re-embedded + reconciled.
        collection.throwVectorAbsentFor.delete('bad');
        const second = await drain(collection, {expectedDimension: VECTOR_DIMENSION, retryState, now: () => 9_000_000});
        expect(second).toMatchObject({embedded: 1, metadataOnly: 0});
        expect(await readPendingWalRecords({dir: tmpDir})).toHaveLength(0);
    });

    test('#14228 verify is opt-in: without expectedDimension, add-success is treated as embed-success (pre-#14228 behavior, verify skipped)', async () => {
        await seed('legacy');

        const collection = createFakeCollection();
        collection.noVectorFor.add('legacy');   // even with no persisted vector, the skipped verify marks it embedded

        const summary = await drain(collection);   // no expectedDimension → verify skipped
        expect(summary).toMatchObject({embedded: 1, metadataOnly: 0});
        expect(collection.getCalls).toHaveLength(0);   // verify did not run
        expect(await readPendingWalRecords({dir: tmpDir})).toHaveLength(0);
    });

    test('retry/backoff: transient whole-batch failures retry with exponential delays, then succeed', async () => {
        await seed('t1');
        await seed('t2');

        const collection = createFakeCollection();
        collection.failNextAdds = 2;

        const sleeps  = [];
        const summary = await drain(collection, {sleep: async ms => sleeps.push(ms)});

        expect(summary.embedded).toBe(2);
        expect(summary.failed).toBe(0);
        expect(collection.addCalls).toHaveLength(3);   // fail, fail, success — within maxRetries=2
        expect(sleeps).toEqual([
            getBackoffDelayMs(1000, 0),
            getBackoffDelayMs(1000, 1)
        ]);
        expect(await readPendingWalRecords({dir: tmpDir})).toHaveLength(0);
    });

    test('poison isolation + cooldown: a failing record cannot block its batch-mates and retries after backoff', async () => {
        await seed('healthy');
        await seed('poison');

        const collection = createFakeCollection();
        collection.onAdd = ({ids}) => {
            if (ids.includes('poison')) throw new Error('poison record (spec)');
        };

        const retryState = new Map();
        let   virtualNow = 1_000_000;
        const now        = () => virtualNow;

        // Cycle 1: whole-batch attempts fail (poison in batch) → per-record pass isolates it.
        const first = await drain(collection, {retryState, now});
        expect(first.embedded).toBe(1);
        expect(first.failed).toBe(1);
        expect(collection.store.has('healthy')).toBe(true);
        expect(collection.store.has('poison')).toBe(false);
        expect(retryState.get('poison')).toMatchObject({failures: 1});

        // Cycle 2, same instant: the poison record is cooling down — skipped, not retried.
        const second = await drain(collection, {retryState, now});
        expect(second).toMatchObject({pending: 1, embedded: 0, failed: 0, cooling: 1});

        // Cycle 3, past the cooldown, embedder healed: the record drains — never abandoned.
        collection.onAdd = null;
        virtualNow += getBackoffDelayMs(1000, 1) + 1;
        const third = await drain(collection, {retryState, now});
        expect(third.embedded).toBe(1);
        expect(collection.store.has('poison')).toBe(true);
        expect(retryState.has('poison')).toBe(false); // state cleared on success
        expect(await readPendingWalRecords({dir: tmpDir})).toHaveLength(0);
    });

    test('AC5: a record tombstoned BEFORE the drain is never re-embedded', async () => {
        const tombstonedSegment = await seed('purged');
        await seed('kept');

        // SessionService.purgeSession's tombstone: an embed marker reconciles the record.
        await appendWalEmbedMarker({id: 'purged', segmentKey: tombstonedSegment}, {dir: tmpDir});

        const collection = createFakeCollection();
        const summary    = await drain(collection);

        expect(summary.pending).toBe(1);               // only 'kept' is pending work
        expect(summary.embedded).toBe(1);
        expect(collection.store.has('purged')).toBe(false);
        expect(collection.store.has('kept')).toBe(true);
    });

    test('AC5: a record tombstoned MID-embed is compensated (deleted, not marker-claimed)', async () => {
        const racedSegment = await seed('raced');
        await seed('normal');

        const collection = createFakeCollection();
        // Simulate purgeSession racing the in-flight embed: the tombstone lands while
        // collection.add is executing (after the drain's pending read, before its re-read).
        collection.onAdd = async ({ids}) => {
            if (ids.includes('raced')) {
                await appendWalEmbedMarker({id: 'raced', segmentKey: racedSegment}, {dir: tmpDir});
            }
        };

        const summary = await drain(collection);

        expect(summary.compensated).toBe(1);
        expect(summary.embedded).toBe(1);                    // 'normal' drains normally
        expect(collection.deleteCalls).toEqual([['raced']]); // the resurrected doc is removed
        expect(collection.store.has('raced')).toBe(false);
        expect(collection.store.has('normal')).toBe(true);
        expect(await readPendingWalRecords({dir: tmpDir})).toHaveLength(0);
    });

    test('targeted drain: `ids` reconciles only the requested records', async () => {
        await seed('mine');
        await seed('foreign');

        const collection = createFakeCollection();
        const summary    = await drain(collection, {ids: ['mine']});

        expect(summary).toMatchObject({pending: 1, embedded: 1});
        expect(collection.store.has('mine')).toBe(true);
        expect(collection.store.has('foreign')).toBe(false);
        expect(await readPendingWalRecords({dir: tmpDir})).toHaveLength(1); // 'foreign' untouched
    });

    test('batchSize bounds one cycle; the next cycle picks up the remainder', async () => {
        await seed('b1');
        await seed('b2');
        await seed('b3');

        const collection = createFakeCollection();

        const first = await drain(collection, {batchSize: 2});
        expect(first).toMatchObject({pending: 3, embedded: 2});

        const second = await drain(collection, {batchSize: 2});
        expect(second).toMatchObject({pending: 1, embedded: 1});
        expect(collection.store.size).toBe(3);
    });

    test('prune wiring: fully-reconciled old segments beyond the retention bound are removed', async () => {
        const day = 24 * 60 * 60 * 1000;
        await seed('old1', Date.now() - 40 * day);
        await seed('old2', Date.now() - 39 * day);

        const collection = createFakeCollection();

        // Drain reconciles both old segments; retentionLimit 1 keeps the newer, prunes the older.
        const summary = await drain(collection, {retentionLimit: 1});

        expect(summary.embedded).toBe(2);
        expect(summary.prunedSegments).toBe(1);
    });

    test('embedBatch: per-record fallback reports exactly the failing records', async () => {
        const records    = ['x', 'y'].map(id => ({...record(id, Date.now()), segmentKey: 'unused'}));
        const collection = createFakeCollection();
        collection.onAdd = ({ids}) => {
            if (ids.includes('y')) throw new Error('y is poison (spec)');
        };

        const {succeeded, failed} = await embedBatch({
            collection,
            records,
            maxRetries   : 0,
            backoffBaseMs: 1,
            sleep        : async () => {},
            log          : () => {}
        });

        expect(succeeded.map(r => r.id)).toEqual(['x']);
        expect(failed).toHaveLength(1);
        expect(failed[0].record.id).toBe('y');
        expect(failed[0].error.message).toContain('poison');
    });

    test('embedBatch owns WAL attribution only around its collection writes', async () => {
        const records    = [{...record('x', Date.now()), segmentKey: 'unused'}];
        const collection = createFakeCollection();
        const contexts   = [];

        collection.onAdd = () => contexts.push(getProviderActivityContext());

        await embedBatch({
            collection,
            records,
            maxRetries   : 0,
            backoffBaseMs: 1,
            sleep        : async () => {},
            log          : () => {}
        });

        expect(contexts).toEqual([{
            operationStage: 'mc-wal-drain-embedding',
            service       : 'memory-core'
        }]);
        expect(getProviderActivityContext()).toBeNull();
    });

    test('embedBatch: provider contention yields the cycle — one attempt, no isolation pass (#16012)', async () => {
        const records    = ['x', 'y', 'z'].map(id => ({...record(id, Date.now()), segmentKey: 'unused'}));
        const collection = createFakeCollection();
        let   addCalls   = 0;
        let   slept      = 0;

        collection.onAdd = () => {
            addCalls++;
            const error = new Error('openAiCompatible request timed out after 300000ms');

            error.code = OPENAI_COMPATIBLE_REQUEST_TIMEOUT_CODE;
            throw error;
        };

        const {succeeded, failed} = await embedBatch({
            collection,
            records,
            maxRetries   : 5,
            backoffBaseMs: 1,
            sleep        : async () => { slept++; },
            log          : () => {}
        });

        // Pre-fix this was 6 whole-batch attempts plus a 3-record isolation pass = 9 offered
        // requests to a provider whose queue was already the reason the first one timed out.
        expect(addCalls).toBe(1);
        expect(slept).toBe(0);

        // Deferred, not dropped: the caller spaces these via the cross-cycle retryState cooldown.
        expect(succeeded).toHaveLength(0);
        expect(failed.map(entry => entry.record.id)).toEqual(['x', 'y', 'z']);
        expect(failed[0].error.code).toBe(OPENAI_COMPATIBLE_REQUEST_TIMEOUT_CODE);
    });

    test('embedBatch: native-Ollama PROVIDER_TIMEOUT is the same contention class (#16012)', async () => {
        const records    = [{...record('a', Date.now()), segmentKey: 'unused'}];
        const collection = createFakeCollection();
        let   addCalls   = 0;

        collection.onAdd = () => {
            addCalls++;
            const error = new Error('embedding request timed out');

            error.code = 'PROVIDER_TIMEOUT';
            throw error;
        };

        await embedBatch({
            collection,
            records,
            maxRetries   : 3,
            backoffBaseMs: 1,
            sleep        : async () => {},
            log          : () => {}
        });

        // The classifier must not be OpenAI-compatible-only, or the native provider keeps amplifying.
        expect(addCalls).toBe(1);
    });

    test('embedBatch: a NON-contention failure still retries and still isolates (control, #16012)', async () => {
        const records    = ['x', 'y'].map(id => ({...record(id, Date.now()), segmentKey: 'unused'}));
        const collection = createFakeCollection();
        let   batchCalls = 0;
        let   slept      = 0;

        collection.onAdd = ({ids}) => {
            if (ids.length > 1) {
                batchCalls++;
                throw new Error('malformed payload (spec) — not a timeout');
            }

            if (ids.includes('y')) throw new Error('y is poison (spec)');
        };

        const {succeeded, failed} = await embedBatch({
            collection,
            records,
            maxRetries   : 2,
            backoffBaseMs: 1,
            sleep        : async () => { slept++; },
            log          : () => {}
        });

        // Without this control the fix could trade amplification for a silently-skipped retry path.
        expect(batchCalls).toBe(3);
        expect(slept).toBe(2);
        expect(succeeded.map(r => r.id)).toEqual(['x']);
        expect(failed.map(entry => entry.record.id)).toEqual(['y']);
    });

    test('embedBatch: the in-cycle wall-clock budget stops new attempts AND the isolation pass (#16012 AC4)', async () => {
        const records    = ['x', 'y', 'z'].map(id => ({...record(id, Date.now()), segmentKey: 'unused'}));
        const collection = createFakeCollection();
        let   addCalls   = 0;
        let   clock      = 0;

        // Each attempt "costs" 1200ms of wall clock against a 1000ms budget, so the FIRST failure
        // exhausts it — the loop must stop rather than spend maxRetries more externally-bounded calls.
        // (900ms would not exhaust it and retrying would be correct; the fixture has to overshoot.)
        collection.onAdd = () => {
            addCalls++;
            clock += 1200;
            throw new Error('provider unreachable (spec) — not a timeout code');
        };

        const {succeeded, failed} = await embedBatch({
            collection,
            records,
            maxRetries   : 5,
            backoffBaseMs: 1,
            sleep        : async () => {},
            log          : () => {},
            maxInCycleMs : 1000,
            now          : () => clock
        });

        // One attempt, then the budget check stops everything: no further batch attempts and no
        // 3-record isolation pass. Without the bound this is 6 + 3 = 9 externally-bounded calls.
        expect(addCalls).toBe(1);
        expect(succeeded).toHaveLength(0);
        expect(failed.map(entry => entry.record.id)).toEqual(['x', 'y', 'z']);
    });

    test('embedBatch: a backoff that crosses the budget boundary starts no further attempt (#16012 AC4)', async () => {
        const records    = [{...record('a', Date.now()), segmentKey: 'unused'}];
        const collection = createFakeCollection();
        let   addCalls   = 0;
        let   clock      = 0;

        // @neo-gpt's cycle-2 falsifier, verbatim: the attempt itself finishes INSIDE the budget
        // (900 < 1000), so a post-failure-only guard passes — and then the sleep advances the clock
        // past the boundary. Without a post-sleep re-check the loop starts a second external request
        // from beyond the budget: observed {calls: 2, clock: 2000} at e9d3bf4702.
        collection.onAdd = () => {
            addCalls++;
            clock += 900;
            throw new Error('provider unreachable (spec) — not a timeout code');
        };

        const {succeeded, failed} = await embedBatch({
            collection,
            records,
            maxRetries   : 5,
            backoffBaseMs: 1,
            sleep        : async () => { clock += 200; },  // 900 + 200 = 1100 > 1000
            log          : () => {},
            maxInCycleMs : 1000,
            now          : () => clock
        });

        expect(addCalls).toBe(1);
        expect(succeeded).toHaveLength(0);
        expect(failed.map(entry => entry.record.id)).toEqual(['a']);
    });

    test('embedBatch: an unlimited budget leaves the retry+isolation path unchanged (control, #16012 AC4)', async () => {
        const records    = ['x', 'y'].map(id => ({...record(id, Date.now()), segmentKey: 'unused'}));
        const collection = createFakeCollection();
        let   batchCalls = 0;

        collection.onAdd = ({ids}) => {
            if (ids.length > 1) {
                batchCalls++;
                throw new Error('batch failure (spec)');
            }

            if (ids.includes('y')) throw new Error('y is poison (spec)');
        };

        const {succeeded, failed} = await embedBatch({
            collection,
            records,
            maxRetries   : 2,
            backoffBaseMs: 1,
            sleep        : async () => {},
            log          : () => {},
            maxInCycleMs : 0,          // disabled
            now          : () => 0
        });

        // A disabled budget must not silently change behaviour for anyone who does not opt in.
        expect(batchCalls).toBe(3);
        expect(succeeded.map(r => r.id)).toEqual(['x']);
        expect(failed.map(entry => entry.record.id)).toEqual(['y']);
    });

    test('getBackoffDelayMs caps at MAX_RECORD_COOLDOWN_MS', () => {
        expect(getBackoffDelayMs(1000, 0)).toBe(1000);
        expect(getBackoffDelayMs(1000, 3)).toBe(8000);
        expect(getBackoffDelayMs(1000, 60)).toBe(MAX_RECORD_COOLDOWN_MS);
    });

    test.describe('startDrainLoop (shared loop host — daemon AND in-process server modes)', () => {
        const loopConfig = (dir) => () => ({dir, batchSize: 10, maxRetries: 0, backoffBaseMs: 1, retentionLimit: 0, pollIntervalMs: 10});

        test('drains seeded records on its cadence; stop() ends the loop', async () => {
            await seed('loop-1');
            const collection = createFakeCollection();

            const loop = startDrainLoop({
                getCollection: async () => collection,
                getConfig    : loopConfig(tmpDir)
            });

            await expect.poll(() => collection.store.has('loop-1'), {timeout: 5000}).toBe(true);
            expect(await readPendingWalRecords({dir: tmpDir})).toHaveLength(0);

            loop.stop();

            // A record seeded after stop() is never drained — the loop is genuinely ended.
            await seed('after-stop');
            await new Promise(resolve => setTimeout(resolve, 60));
            expect(collection.store.has('after-stop')).toBe(false);
        });

        test('absorbs a failing cycle and keeps looping (collection resolution failure)', async () => {
            await seed('resilient');
            const collection  = createFakeCollection();
            let   resolutions = 0;

            const loop = startDrainLoop({
                getCollection: async () => {
                    if (++resolutions === 1) throw new Error('store down (spec)');
                    return collection;
                },
                getConfig: loopConfig(tmpDir)
            });

            // First cycle fails on collection resolution; a later cycle drains the record anyway.
            await expect.poll(() => collection.store.has('resilient'), {timeout: 5000}).toBe(true);
            loop.stop();
        });
    });

    // The falsifier that the isolated receipt unit-spec structurally cannot provide: feed the receipt
    // the summary the REAL drain emits, not a hand-built one. A tracker graded from fabricated
    // summaries green-lit a semantic handoff the source could never produce — `pending` is a pre-drain
    // observation, so a fully-drained one-record cycle's summary carries `pending: 1`, and reading
    // that as work-left reported `dirty` forever under steady traffic.
    test.describe('#15802 drainWalOnce → drain-disposition receipt (producer→consumer boundary)', () => {
        test('a fully-drained cycle is CLEAN even though its pre-drain `pending` was non-zero', async () => {
            await seed('only');

            const summary = await drain(createFakeCollection());
            // The real producer's shape for "read one, drained one": pending is the pre-drain count.
            expect(summary).toMatchObject({pending: 1, embedded: 1, compensated: 0, outstanding: 0});

            const disposition = createDrainDispositionTracker({now: () => 1000});
            disposition.recordCycle(summary);

            expect(disposition.getDisposition()).toMatchObject({state: 'clean', drainedClean: true});
        });

        test('a batch-overflowed cycle leaves real residue → DIRTY', async () => {
            await seed('a');
            await seed('b');
            await seed('c');

            const summary = await drain(createFakeCollection(), {batchSize: 1});
            // Reads all three (the scan is not limit-bounded), embeds one, two overflow → residue 2.
            expect(summary).toMatchObject({pending: 3, embedded: 1, outstanding: 2});

            const disposition = createDrainDispositionTracker({now: () => 1000});
            disposition.recordCycle(summary);

            const receipt = disposition.getDisposition();
            expect(receipt.state).toBe('dirty');
            expect(receipt.reason).toContain('outstanding=2');
        });
    });
});
