import {test, expect} from '@playwright/test';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import {mkdtemp, rm}   from 'fs/promises';
import os              from 'os';
import path            from 'path';

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
        (await appendWalMemory(record(id, timestampMs), {dir: tmpDir})).segmentKey;

    /**
     * Controllable content-store fake: records every add/delete, stores by id, and exposes
     * `failNextAdds` (transient whole-batch failures) + `onAdd` (per-payload hook, e.g. poison
     * records or mid-embed tombstones).
     */
    const createFakeCollection = () => {
        const fake = {
            store      : new Map(),
            addCalls   : [],
            deleteCalls: [],
            failNextAdds: 0,
            onAdd      : null,
            add: async payload => {
                fake.addCalls.push(payload);
                if (fake.onAdd) await fake.onAdd(payload);
                if (fake.failNextAdds > 0) {
                    fake.failNextAdds--;
                    throw new Error('store down (spec)');
                }
                payload.ids.forEach((id, i) => fake.store.set(id, payload.metadatas[i]));
            },
            delete: async ({ids}) => {
                fake.deleteCalls.push(ids);
                ids.forEach(id => fake.store.delete(id));
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
            const collection = createFakeCollection();
            let resolutions  = 0;

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
});
