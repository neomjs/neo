import {setup} from '../../../../setup.mjs';

const appName = 'TemporalSummaryAggregationServiceTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

// Test-side entry-point bootstrap: Neo + core/_export populate `globalThis.Neo` before the dynamic
// service import below (the class file no longer imports Neo — the class+wrapper split).
import Neo       from '../../../../../../src/Neo.mjs';
import * as core from '../../../../../../src/core/_export.mjs';

import {test, expect} from '@playwright/test';

test.describe('Neo.ai.daemons.TemporalSummaryAggregationService', () => {
    let TemporalSummaryAggregationService, logger, StorageRouter, originals = {};

    test.beforeAll(async () => {
        TemporalSummaryAggregationService = (await import('../../../../../../ai/daemons/temporal-summary/TemporalSummaryAggregationService.mjs')).default;
        logger                            = (await import('../../../../../../ai/mcp/server/memory-core/logger.mjs')).default;
        StorageRouter                     = (await import('../../../../../../ai/services.mjs')).Memory_StorageRouter;

        originals = {info: logger.info, debug: logger.debug, error: logger.error, getTemporalSummaryCollection: StorageRouter.getTemporalSummaryCollection};
        logger.info  = () => {};
        logger.debug = () => {};
        logger.error = () => {}
    });

    test.afterAll(() => {
        logger.info  = originals.info;
        logger.debug = originals.debug;
        logger.error = originals.error
    });

    test.afterEach(() => {
        StorageRouter.getTemporalSummaryCollection = originals.getTemporalSummaryCollection;
        TemporalSummaryAggregationService.stop();
        TemporalSummaryAggregationService.isPolling      = false;
        TemporalSummaryAggregationService.pollIntervalMs = null;

        // Drop instance-method seam overrides so the real prototype methods resurface for the next test.
        for (const seam of ['scheduleNext', 'acquireLease', 'releaseLease', 'collectPendingWindows', 'persistTemporalRecord', 'runCycle']) {
            delete TemporalSummaryAggregationService[seam]
        }
    });

    test('start() is a no-op when enabled is false', () => {
        let scheduled = 0;

        TemporalSummaryAggregationService.scheduleNext = () => { scheduled++ };
        TemporalSummaryAggregationService.start({enabled: false, pollIntervalMs: 1000});

        expect(TemporalSummaryAggregationService.isPolling).toBe(false);
        expect(scheduled).toBe(0)
    });

    test('start() schedules when enabled + is idempotent', () => {
        let scheduled = 0;

        TemporalSummaryAggregationService.scheduleNext = () => { scheduled++ };

        TemporalSummaryAggregationService.start({enabled: true, pollIntervalMs: 1000});
        expect(TemporalSummaryAggregationService.isPolling).toBe(true);
        expect(scheduled).toBe(1);

        // second start() while polling is a no-op — no second schedule
        TemporalSummaryAggregationService.start({enabled: true, pollIntervalMs: 1000});
        expect(scheduled).toBe(1)
    });

    test('start() throws when enabled without a positive pollIntervalMs', () => {
        expect(() => TemporalSummaryAggregationService.start({enabled: true})).toThrow(/positive pollIntervalMs/)
    });

    test('pulse() defers the whole cycle when the heavy-maintenance lease is held', async () => {
        let cycles = 0, releases = 0;

        TemporalSummaryAggregationService.scheduleNext = () => {};
        TemporalSummaryAggregationService.acquireLease = () => ({acquired: false, lease: {owner: 'rem-daemon'}});
        TemporalSummaryAggregationService.runCycle     = async () => { cycles++ };
        TemporalSummaryAggregationService.releaseLease = () => { releases++ };

        await TemporalSummaryAggregationService.pulse();

        expect(cycles).toBe(0);   // deferred — no aggregation runs under a held lease
        expect(releases).toBe(0)  // never acquired → nothing to release
    });

    test('pulse() runs the cycle + releases the lease when acquired', async () => {
        const persisted     = [];
        let   releasedToken = null;

        TemporalSummaryAggregationService.scheduleNext          = () => {};
        TemporalSummaryAggregationService.acquireLease          = () => ({acquired: true, lease: {token: 'tok-1'}});
        TemporalSummaryAggregationService.releaseLease          = token => { releasedToken = token };
        TemporalSummaryAggregationService.collectPendingWindows = async () => [{
            level      : 'daily',
            windowStart: '2026-07-05T00:00:00.000Z',
            windowEnd  : '2026-07-06T00:00:00.000Z',
            sources    : {mergedPrs: [{n: 1}]}
        }];
        TemporalSummaryAggregationService.persistTemporalRecord = async record => { persisted.push(record) };

        await TemporalSummaryAggregationService.pulse();

        expect(releasedToken).toBe('tok-1');   // lease always released in finally
        expect(persisted).toHaveLength(1);
        expect(persisted[0].metadata.partition).toBe('unified');
        expect(persisted[0].velocityFields.mergedPrs).toBe(1)
    });

    test('pulse() still releases the lease when the cycle throws', async () => {
        let releasedToken = null;

        TemporalSummaryAggregationService.scheduleNext = () => {};
        TemporalSummaryAggregationService.acquireLease = () => ({acquired: true, lease: {token: 'tok-2'}});
        TemporalSummaryAggregationService.releaseLease = token => { releasedToken = token };
        TemporalSummaryAggregationService.runCycle     = async () => { throw new Error('boom') };

        await TemporalSummaryAggregationService.pulse();   // pulse swallows the cycle error

        expect(releasedToken).toBe('tok-2')   // finally released despite the throw
    });

    test('persistTemporalRecord upserts the record into the temporal-summary collection by its doc id', async () => {
        const upserts = [];

        StorageRouter.getTemporalSummaryCollection = async () => ({upsert: async args => { upserts.push(args) }});

        const record = {
            id            : 'temporal-summary-daily-unified-2026-07-05-v1',
            metadata      : {level: 'daily', partition: 'unified', windowStart: '2026-07-05T00:00:00.000Z', windowEnd: '2026-07-06T00:00:00.000Z', version: 1},
            velocityFields: {mergedPrs: 3}
        };

        await TemporalSummaryAggregationService.persistTemporalRecord(record);

        expect(upserts).toHaveLength(1);
        expect(upserts[0].ids).toEqual([record.id]);
        expect(upserts[0].metadatas).toEqual([record.metadata]);
        expect(JSON.parse(upserts[0].documents[0])).toEqual({mergedPrs: 3})
    })
});
