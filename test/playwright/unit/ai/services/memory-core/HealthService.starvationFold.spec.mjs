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
import Neo                              from '../../../../../../src/Neo.mjs';
import * as core                        from '../../../../../../src/core/_export.mjs';
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
        }
    });

    test('healthy and disabled postures read CLEAR and keep the all-clear line', () => {
        for (const posture of ['healthy', 'disabled']) {
            const payload = makePayload();

            payload.details.push('All features are operational');

            foldHeavyMaintenanceStarvation({
                payload,
                inspection  : makeInspection({receipt: makeReceipt({posture, breaches: []})}),
                now         : NOW,
                staleAfterMs: STALE_AFTER_MS
            });

            expect(payload.status).toBe('healthy');
            expect(payload.details).toEqual(['All features are operational']);
            expect(payload.heavyMaintenanceStarvation).toMatchObject({state: 'consumed-clear', posture});
        }
    });

    // `unknown` used to fall through to `consumed-clear`, which left the all-clear line
    // standing — the fold asserting "operational" on the strength of a verdict the watchdog
    // explicitly could not reach. Inconclusive may neither degrade nor claim green.
    test('a FRESH unknown posture neither degrades nor asserts green — the all-clear line is withdrawn', () => {
        const payload = makePayload();

        payload.details.push('All features are operational');

        foldHeavyMaintenanceStarvation({
            payload,
            inspection  : makeInspection({receipt: makeReceipt({posture: 'unknown', breaches: []})}),
            now         : NOW,
            staleAfterMs: STALE_AFTER_MS
        });

        expect(payload.status).toBe('healthy');
        expect(payload.details).not.toContain('All features are operational');
        expect(payload.details.join(' ')).toContain('unknown, not clear');
        expect(payload.heavyMaintenanceStarvation).toMatchObject({state: 'consumed-unknown', posture: 'unknown'});
    });

    // Duty cycle: the receipt is only restamped once per watchdog cadence, so the worst-case
    // age a live verdict ever reaches is one full cadence. The bound must cover that age; the
    // superseded bridge-write clock did not, which is the whole 8-of-10-minutes defect.
    test('a receipt aged one full producer cadence stays consumable under the derived bound', () => {
        const cadenceMs = 10 * 60 * 1000,
              derived   = cadenceMs * 2,
              payload   = makePayload();

        foldHeavyMaintenanceStarvation({
            payload,
            inspection  : makeInspection({receipt: makeReceipt({checkedAgoMs: cadenceMs})}),
            now         : NOW,
            staleAfterMs: derived
        });

        expect(payload.status).toBe('degraded');
        expect(payload.heavyMaintenanceStarvation).toMatchObject({state: 'consumed-degraded'});
    });

    // The bound's upper end is the other half of the contract: it exists to expire a DEAD producer,
    // not to widen a live one. Two cadences is the tolerance (one full period plus a missed run);
    // past that the receipt stops being evidence and the fold must decline to degrade on it.
    test('the derived bound spans two producer cadences and expires past them', () => {
        const cadenceMs = 10 * 60 * 1000,
              derived   = cadenceMs * 2;

        for (const [checkedAgoMs, expectedState, expectedStatus] of [
            [cadenceMs * 2,     'consumed-degraded', 'degraded'],
            [cadenceMs * 2 + 1, 'receipt-stale',     'healthy']
        ]) {
            const payload = makePayload();

            foldHeavyMaintenanceStarvation({
                payload,
                inspection  : makeInspection({receipt: makeReceipt({checkedAgoMs})}),
                now         : NOW,
                staleAfterMs: derived
            });

            expect(payload.status).toBe(expectedStatus);
            expect(payload.heavyMaintenanceStarvation.state).toBe(expectedState);
        }
    });

    test('mutation control: the same receipt under the superseded bridge bound reads stale and stays green', () => {
        const cadenceMs        = 10 * 60 * 1000,
              supersededBridge = 2 * 60 * 1000,
              payload          = makePayload();

        foldHeavyMaintenanceStarvation({
            payload,
            inspection  : makeInspection({receipt: makeReceipt({checkedAgoMs: cadenceMs})}),
            now         : NOW,
            staleAfterMs: supersededBridge
        });

        expect(payload.status).toBe('healthy');
        expect(payload.heavyMaintenanceStarvation).toMatchObject({state: 'receipt-stale', posture: 'degraded'});
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

    test('PRODUCTION CHAIN at the composed MCP surface — degraded receipt degrades the response while ensureHealthy() tool admission stays open', async () => {
        const HealthService                  = (await import('../../../../../../ai/services/memory-core/HealthService.mjs')).default;
        const {composeMemoryCoreHealthcheck} = await import('../../../../../../ai/mcp/server/memory-core/toolService.mjs');

        const makeInspectionFor = posture => {
            const nowIso   = new Date().toISOString();
            const degraded = posture === 'degraded';

            return {
                ok      : true,
                status  : 'available',
                snapshot: {
                    generatedAt               : Date.now(),
                    heavyMaintenanceStarvation: {
                        posture,
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

        const compose = (health, posture) => composeMemoryCoreHealthcheck({
            health,
            memoryWalDrain        : {state: 'idle'},
            plane                 : {id: 'test-plane', dataRoot: '/tmp/test-plane'},
            deploymentInspection  : makeInspectionFor(posture),
            starvationStaleAfterMs: STALE_AFTER_MS
        });

        const healthyBase = {status: 'healthy', details: ['Connected to the orchestrator-managed ChromaDB instance', 'All features are operational']};

        // Fresh degraded receipt at the COMPOSED surface: degraded, all-clear withdrawn, receipt in
        // details — this is what the MCP healthcheck tool, Docker healthcheck, and container-health
        // controllers observe.
        const degradedResponse = compose(healthyBase, 'degraded');
        expect(degradedResponse.status).toBe('degraded');
        expect(degradedResponse.details).not.toContain('All features are operational');
        expect(degradedResponse.details.some(detail => detail.includes('Heavy-maintenance starvation: backup'))).toBe(true);
        expect(degradedResponse.heavyMaintenanceStarvation).toMatchObject({state: 'consumed-degraded', posture: 'degraded', leaseHolder: 'dream'});

        // The base payload was never mutated (a cached object upstream stays pristine), and a clear
        // receipt composes healthy again — latch-free by per-request construction.
        expect(healthyBase.status).toBe('healthy');
        expect(healthyBase.details).toContain('All features are operational');
        const clearResponse = compose(healthyBase, 'healthy');
        expect(clearResponse.status).toBe('healthy');
        expect(clearResponse.details).toContain('All features are operational');
        expect(clearResponse.heavyMaintenanceStarvation.state).toBe('consumed-clear');

        for (const breaches of [{}, [null]]) {
            const malformedInspection = makeInspectionFor('degraded');
            malformedInspection.snapshot.heavyMaintenanceStarvation.breaches = breaches;

            const malformedResponse = composeMemoryCoreHealthcheck({
                health                : healthyBase,
                memoryWalDrain        : {state: 'idle'},
                plane                 : {id: 'test-plane', dataRoot: '/tmp/test-plane'},
                deploymentInspection  : malformedInspection,
                starvationStaleAfterMs: STALE_AFTER_MS
            });

            expect(malformedResponse.status).toBe('healthy');
            expect(malformedResponse.details).toContain('All features are operational');
            expect(malformedResponse.heavyMaintenanceStarvation).toMatchObject({
                state  : 'fold-error',
                posture: null
            });
            expect(malformedResponse.heavyMaintenanceStarvation.error).toBeTruthy();
        }

        // Unhealthy wins at the composed surface too.
        const unhealthyResponse = compose({status: 'unhealthy', details: ['db down']}, 'degraded');
        expect(unhealthyResponse.status).toBe('unhealthy');
        expect(unhealthyResponse.heavyMaintenanceStarvation.state).toBe('consumed-degraded');

        // THE ADMISSION PIN: starvation-only degradation must never block tool capability.
        // `ensureHealthy()` consumes HealthService.healthcheck() — which never carries the fold —
        // so with the plane's only degradation being starvation, semantic recall stays
        // dispatchable: ensureHealthy resolves rather than throwing.
        //
        // The pin has two halves and only one of them ever needed the live plane:
        //
        //   1. `healthcheck()`'s payload does not carry the fold. That is a claim about the payload's
        //      SHAPE and it holds whatever the plane's status happens to be.
        //   2. `ensureHealthy()` gates on `status` alone, so a fold it cannot see cannot block it.
        //
        // An earlier version asserted `base.status === 'healthy'` first, as an "environment gate".
        // That is a precondition this test does not control: `healthcheck()` probes the real plane,
        // and under `workers: 4` three sibling workers drive load through the same composition, so a
        // perfectly correct `degraded` falsified the gate and the pin reported a failure it had not
        // found. The sibling `HealthService.spec.mjs` already records the rule this broke — end-to-end
        // `healthcheck()` needs ChromaDB + StorageRouter and is validated post-merge, not in a unit
        // spec.
        HealthService.clearCache();

        const base = await HealthService.healthcheck();

        // Half 1 — shape, not status. True on a healthy plane and on a contended one.
        expect(base.heavyMaintenanceStarvation, 'healthcheck() must never carry the fold').toBeUndefined();

        // Half 2 — `ensureHealthy()` against a CONSTRUCTED healthy payload, the same way every other
        // composition in this file is constructed. Stubbing its one collaborator is what makes the
        // admission decision observable without asking the environment to be quiet.
        // `healthcheck` is a CLASS method, so it lives on the prototype and this assignment installs
        // an own-property shadow. Restoring by assignment would leave that shadow in place forever —
        // and capturing `.bind(HealthService)` would leave a *bound* function installed, which is not
        // the original object. A spec that fixes an isolation defect must not create one: the shadow
        // is deleted so the prototype method is exposed again, byte-for-byte the object it was.
        const hadOwnHealthcheck = Object.prototype.hasOwnProperty.call(HealthService, 'healthcheck'),
              originalOwn       = hadOwnHealthcheck ? HealthService.healthcheck : undefined,
              prototypeMethod   = HealthService.healthcheck;

        try {
            HealthService.healthcheck = async () => ({status: 'healthy', details: ['All features are operational']});
            await expect(HealthService.ensureHealthy()).resolves.toBeUndefined();

            // The negative control: the gate is real, so a non-healthy status must still throw.
            // Without this, the stub above could return anything and the arm would still pass.
            HealthService.healthcheck = async () => ({status: 'degraded', details: ['db slow']});
            await expect(HealthService.ensureHealthy()).rejects.toThrow(/not fully operational/);
        } finally {
            if (hadOwnHealthcheck) {
                HealthService.healthcheck = originalOwn
            } else {
                delete HealthService.healthcheck
            }
        }

        // Identity, not equivalence: the singleton is shared across every spec in this project, so
        // leaving a look-alike behind is the same defect one file over.
        expect(HealthService.healthcheck, 'the stub must not outlive this test').toBe(prototypeMethod);
        expect(Object.prototype.hasOwnProperty.call(HealthService, 'healthcheck'),
            'no own-property shadow may remain').toBe(hadOwnHealthcheck);

        HealthService.clearCache();
    });
});
