import {test, expect}                                from '@playwright/test';
import Neo                                           from '../../../../../../../src/Neo.mjs';
import * as core                                     from '../../../../../../../src/core/_export.mjs';
import fs                                            from 'fs/promises';
import os                                            from 'os';
import path                                          from 'path';
import {createFreezeHealOperation, runFreezeReprobe} from '../../../../../../../ai/services/memory-core/helpers/freezeReprobeRunner.mjs';
import {getFreezeRecord, upsertFreezeRecord}         from '../../../../../../../ai/services/memory-core/helpers/freezeRecordStore.mjs';
import {readHealLedger}                              from '../../../../../../../ai/services/memory-core/helpers/healEventLedgerStore.mjs';

async function tmpDir() {
    return await fs.mkdtemp(path.join(os.tmpdir(), 'freeze-reprobe-runner-'));
}

test.describe('freezeReprobeRunner — createFreezeHealOperation (#14166)', () => {
    test('fences via the injected fence + persists a freeze-record + returns frozen', async () => {
        const dir = await tmpDir();
        try {
            const fenceCalls = [],
                  freezeOp   = createFreezeHealOperation({
                      freezeRecordsDir: dir,
                      fence           : async ({collection, reason, now}) => { fenceCalls.push({collection, reason, now}); return [collection, `${collection}-sessions`]; }
                  });

            const result = await freezeOp({collection: 'c1', evidence: {reasonCode: 'misconfigured-embedder'}, now: 1000});

            expect(result).toMatchObject({status: 'frozen', detail: {collection: 'c1', fenced: ['c1', 'c1-sessions'], faultFingerprint: 'misconfigured-embedder'}});
            expect(fenceCalls).toEqual([{collection: 'c1', reason: 'misconfigured-embedder', now: 1000}]); // fenced with the fault as the reason

            // the durable freeze-record the re-probe cycle will later read
            expect(await getFreezeRecord({dir, collectionName: 'c1'})).toMatchObject({collectionName: 'c1', faultFingerprint: 'misconfigured-embedder', frozenAt: 1000});
        } finally {
            await fs.rm(dir, {recursive: true, force: true});
        }
    });

    test('requires a fence function (fail fast on a mis-wired op)', () => {
        expect(() => createFreezeHealOperation({freezeRecordsDir: '/x'})).toThrow(/fence function is required/);
    });
});

test.describe('freezeReprobeRunner — runFreezeReprobe (#14166)', () => {
    test('no-op when nothing is frozen — never probes', async () => {
        const dir = await tmpDir();
        try {
            let   probed   = false;
            const outcomes = await runFreezeReprobe({
                freezeRecordsDir: dir, healLedgerDir: dir, now: 1,
                probe           : async () => { probed = true; return {embedderHealthy: true, dimensionConsistent: true}; },
                unfence         : async () => {}
            });

            expect(outcomes).toEqual([]);
            expect(probed).toBe(false); // no freeze-records to iterate → the probe is never called
        } finally {
            await fs.rm(dir, {recursive: true, force: true});
        }
    });

    test('a cleared fault (healthy probe) auto-unfreezes: lifts the fence, ledgers the unfreeze, clears the record', async () => {
        const dir = await tmpDir();
        try {
            await upsertFreezeRecord({dir, collectionName: 'c1', faultFingerprint: 'embedder', frozenAt: 1000});

            const unfenced = [],
                  outcomes = await runFreezeReprobe({
                      freezeRecordsDir: dir, healLedgerDir: dir, now: 2_000_000, // well past the 10-min re-probe back-off
                      probe           : async () => ({embedderHealthy: true, dimensionConsistent: true}),
                      unfence         : async collectionName => { unfenced.push(collectionName); }
                  });

            expect(outcomes.find(o => o.collectionName === 'c1')).toMatchObject({status: 'unfrozen', unfroze: true});
            expect(unfenced).toEqual(['c1']);                                      // serving fence lifted
            expect(await getFreezeRecord({dir, collectionName: 'c1'})).toBeNull(); // freeze-record cleared
            expect((await readHealLedger({dir})).some(e => e.type === 'unfreeze' && e.collection === 'c1')).toBe(true); // ledgered for the frozen-set
        } finally {
            await fs.rm(dir, {recursive: true, force: true});
        }
    });

    test('a persisting fault (unhealthy probe) stays frozen: no unfence, record retained', async () => {
        const dir = await tmpDir();
        try {
            await upsertFreezeRecord({dir, collectionName: 'c1', faultFingerprint: 'embedder', frozenAt: 1000});

            const unfenced = [],
                  outcomes = await runFreezeReprobe({
                      freezeRecordsDir: dir, healLedgerDir: dir, now: 2_000_000,
                      probe           : async () => ({embedderHealthy: false, dimensionConsistent: false}),
                      unfence         : async collectionName => { unfenced.push(collectionName); }
                  });

            expect(outcomes.find(o => o.collectionName === 'c1')).toMatchObject({status: 'stay-frozen', unfroze: false});
            expect(unfenced).toEqual([]);                                              // fence NOT lifted — fault persists
            expect(await getFreezeRecord({dir, collectionName: 'c1'})).not.toBeNull(); // freeze-record retained
        } finally {
            await fs.rm(dir, {recursive: true, force: true});
        }
    });
});
