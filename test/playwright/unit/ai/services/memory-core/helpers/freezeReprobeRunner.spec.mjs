import {test, expect}                                                               from '@playwright/test';
import Neo                                                                          from '../../../../../../../src/Neo.mjs';
import * as core                                                                    from '../../../../../../../src/core/_export.mjs';
import fs                                                                           from 'fs/promises';
import os                                                                           from 'os';
import path                                                                         from 'path';
import {createFreezeHealOperation, createStoreFenceOperations, runFreezeReprobe}    from '../../../../../../../ai/services/memory-core/helpers/freezeReprobeRunner.mjs';
import {getFreezeRecord, readFreezeRecords, removeFreezeRecord, upsertFreezeRecord} from '../../../../../../../ai/services/memory-core/helpers/freezeRecordStore.mjs';
import {readHealLedger}                                                             from '../../../../../../../ai/services/memory-core/helpers/healEventLedgerStore.mjs';

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

    test('a cleared fault (healthy probe) auto-unfreezes: lifts the fence, ledgers the unfreeze, RELEASES the record to a tombstone', async () => {
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
            expect(unfenced).toEqual(['c1']); // serving fence lifted

            // NOT deleted: the record is RELEASED to a tombstone (`unfrozenAt` set) that retains the climbing
            // unfreezeAttempts, so a re-freeze within the flap window inherits the count (the bounded anti-thrash fix).
            expect(await getFreezeRecord({dir, collectionName: 'c1'})).toMatchObject({collectionName: 'c1', unfrozenAt: 2_000_000, unfreezeAttempts: 1});

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

test.describe('freezeReprobeRunner — createStoreFenceOperations (#14276 store-level symmetry)', () => {
    test('fence + unfence expand to the SAME served set — a store-level freeze and its auto-unfreeze cannot diverge', async () => {
        const fenced = [], unfenced = [],
              expand = (collection, served) => served.map(s => `${collection}-${s}`), // a store collection → its served set
              ops    = createStoreFenceOperations({
                  quarantine       : async target => { fenced.push(target); },
                  unquarantine     : async target => { unfenced.push(target); },
                  expand,
                  servedCollections: ['memory', 'sessions']
              });

        const fenceTargets   = await ops.fence({collection: 'mc-server', reason: 'embedder', now: 1}),
              unfenceTargets = await ops.unfence('mc-server');

        // both expand mc-server → [mc-server-memory, mc-server-sessions]; the unfence lifts EXACTLY what the fence fenced,
        // so the asymmetry bug (unfence lifts only the record key while served collections stay fenced) is impossible.
        expect(fenced).toEqual(['mc-server-memory', 'mc-server-sessions']);
        expect(unfenced).toEqual(fenced);
        expect(unfenceTargets).toEqual(fenceTargets);
    });

    test('requires quarantine/unquarantine/expand functions (fail fast on a mis-wired pair)', () => {
        expect(() => createStoreFenceOperations({unquarantine: () => {}, expand: () => []})).toThrow(/quarantine.*required/);
    });
});

test.describe('freezeRecordStore — serialized RMW (#14276 lost-update race)', () => {
    test('concurrent upserts all persist — the whole-map read-modify-write does not clobber under interleave', async () => {
        const dir = await tmpDir();
        try {
            // Without serialization each concurrent whole-map RMW reads the same (empty) map and the last write wins,
            // so only ONE record survives. Serialized → every write lands on the prior write's result.
            await Promise.all([
                upsertFreezeRecord({dir, collectionName: 'c1', faultFingerprint: 'e', frozenAt: 1}),
                upsertFreezeRecord({dir, collectionName: 'c2', faultFingerprint: 'e', frozenAt: 1}),
                upsertFreezeRecord({dir, collectionName: 'c3', faultFingerprint: 'e', frozenAt: 1})
            ]);

            expect(Object.keys(await readFreezeRecords({dir})).sort()).toEqual(['c1', 'c2', 'c3']);
        } finally {
            await fs.rm(dir, {recursive: true, force: true});
        }
    });

    test('a concurrent upsert + remove keeps the survivor (the freeze-apply-vs-re-probe interleave the ticket named)', async () => {
        const dir = await tmpDir();
        try {
            await upsertFreezeRecord({dir, collectionName: 'keep', faultFingerprint: 'e', frozenAt: 1});

            await Promise.all([
                upsertFreezeRecord({dir, collectionName: 'added', faultFingerprint: 'e', frozenAt: 1}),
                removeFreezeRecord({dir, collectionName: 'keep'})
            ]);

            // serialized: the remove and the add both apply against the live map — 'keep' gone, 'added' present.
            expect(Object.keys(await readFreezeRecords({dir}))).toEqual(['added']);
        } finally {
            await fs.rm(dir, {recursive: true, force: true});
        }
    });
});

test.describe('freezeReprobeRunner — contained ledgering (#14276)', () => {
    test('a thrash-capped collection ledgers `contained` once on transition, then dedups on the marker', async () => {
        const dir       = await tmpDir(),
              unhealthy = async () => ({embedderHealthy: false, dimensionConsistent: false});
        try {
            // a record AT the unfreeze-attempt cap (default 3) → the decider returns `contained` (no probe)
            await upsertFreezeRecord({dir, collectionName: 'c1', faultFingerprint: 'e', frozenAt: 1000, unfreezeAttempts: 3});

            const outcomes = await runFreezeReprobe({freezeRecordsDir: dir, healLedgerDir: dir, now: 2_000_000, probe: unhealthy, unfence: async () => {}});
            expect(outcomes.find(o => o.collectionName === 'c1')).toMatchObject({status: 'contained'});

            // ledgered exactly once + the containedAt marker set
            expect((await readHealLedger({dir})).filter(e => e.type === 'contained' && e.collection === 'c1')).toHaveLength(1);
            expect((await getFreezeRecord({dir, collectionName: 'c1'}))?.containedAt).toBe(2_000_000);

            // a later tick: still contained, already marked → NOT re-ledgered (no per-poll spam)
            await runFreezeReprobe({freezeRecordsDir: dir, healLedgerDir: dir, now: 3_000_000, probe: unhealthy, unfence: async () => {}});
            expect((await readHealLedger({dir})).filter(e => e.type === 'contained' && e.collection === 'c1')).toHaveLength(1);
        } finally {
            await fs.rm(dir, {recursive: true, force: true});
        }
    });

    test('all freeze re-probe heal-ledger appends honor the supplied retention policy (#14295)', async () => {
        const dir       = await tmpDir(),
              retention = {triggerBytes: 1, maxEvents: 2};

        try {
            await upsertFreezeRecord({dir, collectionName: 'contained', faultFingerprint: 'e', frozenAt: 1000, unfreezeAttempts: 3});
            await runFreezeReprobe({
                freezeRecordsDir   : dir,
                healLedgerDir      : dir,
                healLedgerRetention: retention,
                now                : 2_000_000,
                probe              : async () => ({embedderHealthy: false, dimensionConsistent: false}),
                unfence            : async () => {}
            });
            await removeFreezeRecord({dir, collectionName: 'contained'});

            await upsertFreezeRecord({dir, collectionName: 'recovered', faultFingerprint: 'e', frozenAt: 1000, unfreezeAttempts: 3, containedAt: 1000});
            await runFreezeReprobe({
                freezeRecordsDir   : dir,
                healLedgerDir      : dir,
                healLedgerRetention: retention,
                now                : 1000 + 7 * 60 * 60 * 1000,
                probe              : async () => ({embedderHealthy: true, dimensionConsistent: true}),
                unfence            : async () => {}
            });

            const ledger = await readHealLedger({dir});

            expect(ledger).toHaveLength(2);
            expect(ledger.map(event => event.type)).toEqual(['contained-reopen', 'unfreeze']);
            expect(ledger.every(event => event.collection === 'recovered')).toBe(true);
        } finally {
            await fs.rm(dir, {recursive: true, force: true});
        }
    });
});

test.describe('freezeReprobeRunner — contained recovery (#14276 no permanent strand)', () => {
    const HOUR = 60 * 60 * 1000;

    test('a contained collection past the cooldown is re-opened (reset + ledgered) → auto-unfreezes once the fault clears', async () => {
        const dir = await tmpDir();
        try {
            // capped (contained) 7h ago — past the 6h default cooldown; the fault has since cleared
            await upsertFreezeRecord({dir, collectionName: 'c1', faultFingerprint: 'e', frozenAt: 1000, unfreezeAttempts: 3, lastProbeAt: 1000, containedAt: 1000});

            const unfenced = [],
                  outcomes = await runFreezeReprobe({
                      freezeRecordsDir: dir, healLedgerDir: dir, now: 1000 + 7 * HOUR,
                      probe           : async () => ({embedderHealthy: true, dimensionConsistent: true}),
                      unfence         : async collectionName => { unfenced.push(collectionName); }
                  });

            // reopened (attempts reset) → re-probed → healthy → unfrozen — never permanently stranded
            expect(outcomes.find(o => o.collectionName === 'c1')).toMatchObject({status: 'unfrozen', unfroze: true});
            expect(unfenced).toEqual(['c1']);
            // released to a tombstone (not deleted) on the successful unfreeze — the reopened attempt count (now 1)
            // survives as anti-thrash memory; the stale contained marker is cleared (it is no longer contained).
            expect(await getFreezeRecord({dir, collectionName: 'c1'})).toMatchObject({unfrozenAt: 1000 + 7 * HOUR, unfreezeAttempts: 1});
            const ledger = await readHealLedger({dir});
            expect(ledger.some(e => e.type === 'contained-reopen' && e.collection === 'c1')).toBe(true);
            expect(ledger.some(e => e.type === 'unfreeze'        && e.collection === 'c1')).toBe(true);
        } finally {
            await fs.rm(dir, {recursive: true, force: true});
        }
    });

    test('a contained collection WITHIN the cooldown stays contained — not re-opened, not even probed', async () => {
        const dir = await tmpDir();
        try {
            await upsertFreezeRecord({dir, collectionName: 'c1', faultFingerprint: 'e', frozenAt: 1000, unfreezeAttempts: 3, containedAt: 1000});

            let   probed   = false;
            const outcomes = await runFreezeReprobe({
                freezeRecordsDir: dir, healLedgerDir: dir, now: 1000 + 1 * HOUR, // < 6h cooldown
                probe           : async () => { probed = true; return {embedderHealthy: true, dimensionConsistent: true}; },
                unfence         : async () => {}
            });

            expect(outcomes.find(o => o.collectionName === 'c1')).toMatchObject({status: 'contained'});
            expect(probed).toBe(false);
            expect((await readHealLedger({dir})).some(e => e.type === 'contained-reopen')).toBe(false);
        } finally {
            await fs.rm(dir, {recursive: true, force: true});
        }
    });
});

test.describe('freezeReprobeRunner — flap anti-thrash (#14276 bounded freeze↔unfreeze)', () => {
    const HOUR = 60 * 60 * 1000,
          MIN  = 60 * 1000;

    const healthy = async () => ({embedderHealthy: true, dimensionConsistent: true});

    test('a flapping fault (freeze → healthy-unfreeze → re-freeze …) is BOUNDED: caps to `contained`, never thrashes forever', async () => {
        const dir = await tmpDir();
        try {
            const freezeOp = createFreezeHealOperation({freezeRecordsDir: dir, fence: async ({collection}) => [collection]});

            // Drive the realistic loop: the orchestrator only re-freezes a SERVING collection, so we re-freeze only
            // when the record is absent (fresh) or a released tombstone (fence lifted) — never an actively-frozen one.
            // Pre-fix the record was DELETED on every unfreeze, so each cycle restarted at attempts=0 and returned
            // `unfrozen` forever (gpt's Cycle-3 sim: 5× unfrozen, containedEvents 0). With the tombstone the climbing
            // count survives the flap and the loop reaches the cap.
            const statuses = [];
            let   now      = 1_000_000;

            for (let cycle = 0; cycle < 5; cycle++) {
                const record  = await getFreezeRecord({dir, collectionName: 'c1'}),
                      serving = !record || Number.isFinite(record.unfrozenAt);

                if (serving) {
                    await freezeOp({collection: 'c1', evidence: {reasonCode: 'misconfigured-embedder'}, now});
                }

                const [outcome] = await runFreezeReprobe({freezeRecordsDir: dir, healLedgerDir: dir, now, probe: healthy, unfence: async () => {}});
                statuses.push(outcome.status);
                now += 5 * MIN; // re-freeze well within the 6h flap window → the climbing count is inherited
            }

            // Bounded: the first maxUnfreezeAttempts (default 3) cycles auto-unfreeze, then it caps to `contained` —
            // it does NOT return `unfrozen` for all 5 (the pre-fix flap bug).
            expect(statuses).toEqual(['unfrozen', 'unfrozen', 'unfrozen', 'contained', 'contained']);

            const ledger = await readHealLedger({dir});
            expect(ledger.filter(e => e.type === 'unfreeze'  && e.collection === 'c1')).toHaveLength(3); // capped, not 5
            expect(ledger.filter(e => e.type === 'contained' && e.collection === 'c1')).toHaveLength(1); // ledgered once on transition
        } finally {
            await fs.rm(dir, {recursive: true, force: true});
        }
    });

    test('a re-freeze WITHIN the flap window inherits the released tombstone\'s climbing unfreezeAttempts', async () => {
        const dir = await tmpDir();
        try {
            const freezeOp = createFreezeHealOperation({freezeRecordsDir: dir, fence: async ({collection}) => [collection]});

            // a released tombstone from an unfreeze 5 min ago (within the 6h window), carrying unfreezeAttempts: 2
            await upsertFreezeRecord({dir, collectionName: 'c1', faultFingerprint: 'e', frozenAt: 1000, unfreezeAttempts: 2, unfrozenAt: 2000});

            const result = await freezeOp({collection: 'c1', evidence: {reasonCode: 'e2'}, now: 2000 + 5 * MIN});

            expect(result.detail.reactivated).toBe(true);
            // re-activated: frozen again with the released marker cleared, but the climbing count INHERITED (not reset)
            const record = await getFreezeRecord({dir, collectionName: 'c1'});
            expect(record).toMatchObject({frozenAt: 2000 + 5 * MIN, faultFingerprint: 'e2', unfreezeAttempts: 2});
            expect(record.unfrozenAt).toBeUndefined(); // released marker cleared on re-activation → re-probed again
        } finally {
            await fs.rm(dir, {recursive: true, force: true});
        }
    });

    test('a tombstone past the flap window is garbage-collected; a re-freeze past the window starts a FRESH budget', async () => {
        const dir = await tmpDir();
        try {
            const freezeOp = createFreezeHealOperation({freezeRecordsDir: dir, fence: async ({collection}) => [collection]});

            // a released tombstone from an unfreeze 7h ago — past the 6h flap window — carrying a climbing count
            await upsertFreezeRecord({dir, collectionName: 'c1', faultFingerprint: 'e', frozenAt: 1000, unfreezeAttempts: 2, unfrozenAt: 1000});

            let   probed   = false;
            const outcomes = await runFreezeReprobe({
                freezeRecordsDir: dir, healLedgerDir: dir, now: 1000 + 7 * HOUR,
                probe           : async () => { probed = true; return {embedderHealthy: true, dimensionConsistent: true}; },
                unfence         : async () => {}
            });

            expect(outcomes).toEqual([]);                                          // only a stale tombstone → nothing active to re-probe
            expect(probed).toBe(false);                                            // a tombstone is never probed
            expect(await getFreezeRecord({dir, collectionName: 'c1'})).toBeNull(); // garbage-collected

            // a fresh freeze after the window → a clean recovery budget (the prior climbing count did NOT carry)
            const result = await freezeOp({collection: 'c1', evidence: {reasonCode: 'e'}, now: 1000 + 8 * HOUR});
            expect(result.detail.reactivated).toBe(false);
            const record = await getFreezeRecord({dir, collectionName: 'c1'});
            expect(record).toMatchObject({frozenAt: 1000 + 8 * HOUR});
            expect(record.unfreezeAttempts).toBeUndefined(); // reset, not inherited
        } finally {
            await fs.rm(dir, {recursive: true, force: true});
        }
    });
});
