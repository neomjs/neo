import {setup} from '../../../../setup.mjs';

const appName = 'HealthServiceStarvationFoldTest';

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

import {test, expect}                   from '@playwright/test';
import {foldHeavyMaintenanceStarvation} from '../../../../../../ai/services/memory-core/HealthService.mjs';

const NOW            = 1_000_000_000;
const STALE_AFTER_MS = 2 * 60 * 1000;

function makePayload(status = 'healthy') {
    return {status, details: []};
}

function makeInspection({status = 'available', receipt} = {}) {
    return {
        ok      : status === 'available',
        status,
        snapshot: receipt === undefined ? {generatedAt: NOW} : {generatedAt: NOW, heavyMaintenanceStarvation: receipt}
    };
}

function makeReceipt({posture = 'degraded', checkedAgoMs = 1000, breaches} = {}) {
    return {
        posture,
        checkedAt      : new Date(NOW - checkedAgoMs).toISOString(),
        degradeAfterMs : 3_600_000,
        waiterCount    : breaches?.length ?? 0,
        unreadableCount: 0,
        leaseHolder    : 'dream',
        breaches       : breaches ?? [{taskName: 'backup', priorityZero: true, bootstrapCritical: false, deferredSince: new Date(NOW - 7_200_000).toISOString(), starvedForMs: 7_200_000, leaseHolder: 'dream'}]
    };
}

test.describe('HealthService.foldHeavyMaintenanceStarvation — the consumed aggregate-health matrix (#17049)', () => {
    test('a FRESH degraded receipt degrades aggregate health and preserves the receipt details', () => {
        const payload = makePayload();

        foldHeavyMaintenanceStarvation({
            payload,
            inspection  : makeInspection({receipt: makeReceipt()}),
            now         : NOW,
            staleAfterMs: STALE_AFTER_MS
        });

        expect(payload.status).toBe('degraded');
        expect(payload.details).toHaveLength(1);
        expect(payload.details[0]).toContain('backup deferred since');
        expect(payload.details[0]).toContain('lease holder: dream');
        expect(payload.heavyMaintenanceStarvation).toMatchObject({state: 'consumed-degraded', posture: 'degraded'});
        expect(payload.heavyMaintenanceStarvation.breaches[0].taskName).toBe('backup');
    });

    test('healthy, unknown, and disabled postures never authorize degradation', () => {
        for (const posture of ['healthy', 'unknown', 'disabled']) {
            const payload = makePayload();

            foldHeavyMaintenanceStarvation({
                payload,
                inspection  : makeInspection({receipt: makeReceipt({posture, breaches: []})}),
                now         : NOW,
                staleAfterMs: STALE_AFTER_MS
            });

            expect(payload.status).toBe('healthy');
            expect(payload.details).toEqual([]);
            expect(payload.heavyMaintenanceStarvation).toMatchObject({state: 'consumed-clear', posture});
        }
    });

    test('a STALE receipt cannot authorize degradation even when its posture is degraded', () => {
        const payload = makePayload();

        foldHeavyMaintenanceStarvation({
            payload,
            inspection  : makeInspection({receipt: makeReceipt({checkedAgoMs: STALE_AFTER_MS + 1})}),
            now         : NOW,
            staleAfterMs: STALE_AFTER_MS
        });

        expect(payload.status).toBe('healthy');
        expect(payload.heavyMaintenanceStarvation).toMatchObject({state: 'receipt-stale', posture: 'degraded'});
    });

    test('a stale, schema-degraded, or unavailable snapshot cannot authorize degradation', () => {
        for (const [status, expectedState] of [['stale', 'snapshot-stale'], ['degraded', 'snapshot-degraded'], ['unavailable', 'snapshot-unavailable']]) {
            const payload = makePayload();

            foldHeavyMaintenanceStarvation({
                payload,
                inspection  : makeInspection({status, receipt: makeReceipt()}),
                now         : NOW,
                staleAfterMs: STALE_AFTER_MS
            });

            expect(payload.status).toBe('healthy');
            expect(payload.heavyMaintenanceStarvation.state).toBe(expectedState);
        }

        const nullPayload = makePayload();
        foldHeavyMaintenanceStarvation({payload: nullPayload, inspection: null, now: NOW, staleAfterMs: STALE_AFTER_MS});
        expect(nullPayload.status).toBe('healthy');
        expect(nullPayload.heavyMaintenanceStarvation.state).toBe('snapshot-unavailable');
    });

    test('an absent receipt in an available snapshot records absent and changes nothing', () => {
        const payload = makePayload();

        foldHeavyMaintenanceStarvation({
            payload,
            inspection  : makeInspection({}),
            now         : NOW,
            staleAfterMs: STALE_AFTER_MS
        });

        expect(payload.status).toBe('healthy');
        expect(payload.heavyMaintenanceStarvation).toMatchObject({state: 'absent', posture: null});
    });

    test('an existing unhealthy verdict WINS: the fold preserves the receipt details but never upgrades unhealthy', () => {
        const payload = makePayload('unhealthy');

        foldHeavyMaintenanceStarvation({
            payload,
            inspection  : makeInspection({receipt: makeReceipt()}),
            now         : NOW,
            staleAfterMs: STALE_AFTER_MS
        });

        expect(payload.status).toBe('unhealthy');
        expect(payload.details).toHaveLength(1);
        expect(payload.heavyMaintenanceStarvation.state).toBe('consumed-degraded');
    });

    test('recovery is latch-free: a degraded fold followed by a healthy receipt on the next evaluation reads clean', () => {
        const first = makePayload();
        foldHeavyMaintenanceStarvation({payload: first, inspection: makeInspection({receipt: makeReceipt()}), now: NOW, staleAfterMs: STALE_AFTER_MS});
        expect(first.status).toBe('degraded');

        const second = makePayload();
        foldHeavyMaintenanceStarvation({payload: second, inspection: makeInspection({receipt: makeReceipt({posture: 'healthy', breaches: []})}), now: NOW, staleAfterMs: STALE_AFTER_MS});
        expect(second.status).toBe('healthy');
        expect(second.details).toEqual([]);
    });
});
