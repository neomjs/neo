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

    test('a degraded fold WITHDRAWS the all-clear line a cached-healthy payload carries', () => {
        const payload = makePayload();
        payload.details.push('Connected to the orchestrator-managed ChromaDB instance');
        payload.details.push('All features are operational');

        foldHeavyMaintenanceStarvation({
            payload,
            inspection  : makeInspection({receipt: makeReceipt()}),
            now         : NOW,
            staleAfterMs: STALE_AFTER_MS
        });

        expect(payload.status).toBe('degraded');
        expect(payload.details).not.toContain('All features are operational');
        expect(payload.details).toContain('Connected to the orchestrator-managed ChromaDB instance');
    });

    test('PRODUCTION CHAIN through the public healthcheck(): cached healthy → fresh degraded receipt degrades and withdraws the all-clear → clear receipt recovers', async () => {
        const HealthService = (await import('../../../../../../ai/services/memory-core/HealthService.mjs')).default;

        const originalReader = HealthService.deploymentSnapshotReader;
        let   currentPosture = 'healthy';

        // The seam builds a request-fresh inspection per call, so receipt freshness holds against
        // the real clock and the only variable across the chain is the watchdog's posture.
        HealthService.deploymentSnapshotReader = async () => {
            const nowIso   = new Date().toISOString();
            const degraded = currentPosture === 'degraded';

            return {
                ok      : true,
                status  : 'available',
                snapshot: {
                    generatedAt               : Date.now(),
                    heavyMaintenanceStarvation: {
                        posture        : currentPosture,
                        checkedAt      : nowIso,
                        degradeAfterMs : 3_600_000,
                        waiterCount    : degraded ? 1 : 0,
                        unreadableCount: 0,
                        leaseHolder    : degraded ? 'dream' : null,
                        breaches       : degraded
                            ? [{taskName: 'backup', priorityZero: true, bootstrapCritical: false, deferredSince: nowIso, starvedForMs: 7_200_000, leaseHolder: 'dream'}]
                            : []
                    }
                }
            };
        };

        try {
            HealthService.clearCache();

            // Environment gate, asserted loudly: the chain needs a healthy base composition, so an
            // environment regression reads as THIS line failing rather than a mystery downstream.
            const first = await HealthService.healthcheck();
            expect(first.status).toBe('healthy');
            expect(first.details).toContain('All features are operational');
            expect(first.heavyMaintenanceStarvation.state).toBe('consumed-clear');

            // Cached-healthy + fresh DEGRADED receipt: the healthy cache must not blind the verdict.
            currentPosture = 'degraded';
            const second = await HealthService.healthcheck();
            expect(second.status).toBe('degraded');
            expect(second.details).not.toContain('All features are operational');
            expect(second.details.some(detail => detail.includes('Heavy-maintenance starvation: backup'))).toBe(true);
            expect(second.heavyMaintenanceStarvation).toMatchObject({state: 'consumed-degraded', posture: 'degraded', leaseHolder: 'dream'});

            // Clear receipt against the SAME cached-healthy base: latch-free recovery, and the
            // pristine cached object was never poisoned by the transient degrade.
            currentPosture = 'healthy';
            const third = await HealthService.healthcheck();
            expect(third.status).toBe('healthy');
            expect(third.details).toContain('All features are operational');
            expect(third.heavyMaintenanceStarvation.state).toBe('consumed-clear');
        } finally {
            HealthService.deploymentSnapshotReader = originalReader;
            HealthService.clearCache();
        }
    });
});
