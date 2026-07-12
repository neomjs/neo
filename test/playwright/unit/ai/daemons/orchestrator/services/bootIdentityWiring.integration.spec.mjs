import {test, expect}                 from '@playwright/test';
import Neo                            from '../../../../../../../src/Neo.mjs';
import * as core                      from '../../../../../../../src/core/_export.mjs';
import fs                             from 'fs/promises';
import os                             from 'os';
import path                           from 'path';
import {buildBootIdentitySource}      from '../../../../../../../ai/daemons/orchestrator/services/buildBootIdentitySource.mjs';
import {recordBootIdentityFact}       from '../../../../../../../ai/daemons/orchestrator/services/recordBootIdentityFact.mjs';
import {createBootIdentityReadSource} from '../../../../../../../ai/services/fleet/createBootIdentityReadSource.mjs';

/**
 * Caller-level integration for the boot-identity wiring. Exercises the EXACT chain
 * `Orchestrator.start()` composes + `poll()` persists + the separate fleet-bridge-server process reads:
 *
 *   buildBootIdentitySource(...)  →  recordBootIdentityFact(...)  →  shared file  →  createBootIdentityReadSource(...)
 *
 * over a shared tmp dir, proving the DEFAULT path (a real REM cadence threaded as `freshnessConfig`)
 * produces a NON-`unknown` fact for both worked cases Euclid named — restart-explains-gap and
 * designed-deferral — and that the fact survives the cross-process round-trip to the reader. This is the
 * caller seam without a heavy, flaky full-daemon boot: the composition + carrier + reader are the entire
 * live surface `start()`/`poll()` touch; the daemon around them adds only unrelated services.
 */
test.describe('boot-identity wiring — the Orchestrator.start/poll → shared-file → fleet-read chain (#15079)', () => {
    async function tmpDir() {
        return await fs.mkdtemp(path.join(os.tmpdir(), 'boot-identity-wiring-'));
    }

    // The composition Orchestrator.start() performs (real freshnessConfig + bootAt), with an injected
    // gatherer standing in for the REM-run-state read so a single cycle is deterministic.
    function buildSource({dir, now, cadence, lastCycleAt, bootAt, schedulerResumeState = 'none'}) {
        return buildBootIdentitySource({
            remRunStateDir : dir,
            freshnessConfig: {designedCadenceMs: cadence, marginMs: 0},
            bootAt,
            nowFn          : () => now,
            createGatherer : ({bootAt: b}) => async () => ({bootAt: b, lastCycleAt, schedulerResumeState})
        });
    }

    test('restart-explains-gap: boot AFTER a long-ago last cycle → non-unknown, round-trips to the fleet reader', async () => {
        const dir = await tmpDir();

        // A 9h gap (10h now − 1h last cycle) far exceeds the 6h cadence, and the process booted (2h) AFTER
        // the last cycle with an un-re-armed scheduler → a restart explains it.
        const source  = buildSource({dir, now: 10 * 3600_000, cadence: 6 * 3600_000, lastCycleAt: 1 * 3600_000, bootAt: 2 * 3600_000});
        const written = await recordBootIdentityFact({source, dir}); // poll() writes to the shared dir
        expect(written.classification).toBe('restart-explains-gap'); // non-unknown at the producer

        const served = await createBootIdentityReadSource({dir}).produceBootIdentityFact(); // the fleet server reads back
        expect(served.classification).toBe('restart-explains-gap'); // survives the cross-process round-trip
        expect(served.advisory).toBe(true);                         // read-observe advisory, never a restart command

        await fs.rm(dir, {recursive: true, force: true});
    });

    test('designed-deferral: a last cycle within cadence → non-unknown designed-deferral across the boundary', async () => {
        const dir = await tmpDir();

        const source = buildSource({dir, now: 6000, cadence: 60_000, lastCycleAt: 5000, bootAt: 100});
        await recordBootIdentityFact({source, dir});

        const served = await createBootIdentityReadSource({dir}).produceBootIdentityFact();
        expect(served.classification).toBe('designed-deferral');

        await fs.rm(dir, {recursive: true, force: true});
    });

    test('the unwired seam (no source) writes nothing → the reader keeps its honest advisory-unknown', async () => {
        const dir = await tmpDir();

        await recordBootIdentityFact({source: null, dir}); // no-op — nothing is written

        const served = await createBootIdentityReadSource({dir}).produceBootIdentityFact();
        expect(served.classification).toBe('unknown');
        expect(served.reason).toBe('no-boot-identity-fact-file');

        await fs.rm(dir, {recursive: true, force: true});
    });
});
