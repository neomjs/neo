import {test, expect} from '@playwright/test';
import {
    evaluateWaiterStarvation,
    getDueTask
} from '../../../../../../../ai/daemons/orchestrator/scheduling/heavyMaintenanceStarvationWatchdog.mjs';
import {listActiveWaitersSync} from '../../../../../../../ai/daemons/orchestrator/services/heavyMaintenanceWaiterLedger.mjs';

const HOUR = 60 * 60 * 1000;

function waiterEntry({taskName, deferredSince, updatedAt = deferredSince, priorityZero = false, bootstrapCritical = false}) {
    return {taskName, deferredSince, updatedAt, priorityZero, bootstrapCritical, pid: 4242};
}

test.describe('orchestrator/scheduling/heavyMaintenanceStarvationWatchdog (#17049 / #16561)', () => {
    test('a waiter deferred past the bound degrades with the full receipt (#17049 AC1)', () => {
        const now        = 10 * HOUR;
        const evaluation = evaluateWaiterStarvation({
            ledgerReading: {
                waiters: [
                    waiterEntry({taskName: 'backup', deferredSince: new Date(now - 2 * HOUR).toISOString(), priorityZero: true}),
                    waiterEntry({taskName: 'summary', deferredSince: new Date(now - 10 * 60 * 1000).toISOString()})
                ],
                unreadable: []
            },
            now,
            degradeAfterMs: HOUR,
            leaseHolder   : 'dream'
        });

        expect(evaluation.posture).toBe('degraded');
        expect(evaluation.degraded).toBe(true);
        expect(evaluation.waiterCount).toBe(2);
        expect(evaluation.breaches).toHaveLength(1);
        expect(evaluation.breaches[0]).toEqual({
            taskName         : 'backup',
            priorityZero     : true,
            bootstrapCritical: false,
            deferredSince    : new Date(now - 2 * HOUR).toISOString(),
            starvedForMs     : 2 * HOUR,
            leaseHolder      : 'dream'
        });
    });

    test('the degrade clears on acquisition — recomputed from the live ledger, never latched (#17049 AC3)', () => {
        const now      = 10 * HOUR;
        const breacher = waiterEntry({taskName: 'backup', deferredSince: new Date(now - 2 * HOUR).toISOString(), priorityZero: true});

        // Check N: the waiter is starved past the bound.
        expect(evaluateWaiterStarvation({
            ledgerReading : {waiters: [breacher], unreadable: []},
            now,
            degradeAfterMs: HOUR,
            leaseHolder   : 'dream'
        }).degraded).toBe(true);

        // Check N+1: the waiter acquired, so `clearWaiterSync` removed its entry — the identical
        // evaluation over the live ledger reads green with no state to clear.
        const cleared = evaluateWaiterStarvation({
            ledgerReading : {waiters: [], unreadable: []},
            now           : now + 60000,
            degradeAfterMs: HOUR,
            leaseHolder   : 'backup'
        });

        expect(cleared.posture).toBe('healthy');
        expect(cleared.degraded).toBe(false);
        expect(cleared.breaches).toEqual([]);
    });

    test('stale and corrupt ledger entries never reach the breach scan — proven through the REAL ledger read (#17049 AC3/AC4)', () => {
        const now          = 10 * HOUR;
        const staleAfterMs = 6 * HOUR;
        const files        = {
            'fresh.json' : JSON.stringify(waiterEntry({taskName: 'summary', deferredSince: new Date(now - 30 * 60 * 1000).toISOString(), updatedAt: new Date(now - 60000).toISOString()})),
            // A dead waiter: deferred long past the degrade bound, but its heartbeat stopped past the
            // ledger TTL — expiry drops it BEFORE evaluation, so a corpse cannot hold health red.
            'stale.json' : JSON.stringify(waiterEntry({taskName: 'backup', deferredSince: new Date(now - 9 * HOUR).toISOString(), updatedAt: new Date(now - 7 * HOUR).toISOString(), priorityZero: true})),
            'broken.json': '{not json'
        };
        const fsModule = {
            readdirSync : () => Object.keys(files),
            readFileSync: filePath => {
                const name = Object.keys(files).find(candidate => String(filePath).endsWith(candidate));
                return files[name];
            }
        };

        const ledgerReading = listActiveWaitersSync({leasePath: '/tmp/lease/heavy.lease', staleAfterMs, fsModule, now});

        expect(ledgerReading.waiters.map(entry => entry.taskName)).toEqual(['summary']);
        expect(ledgerReading.unreadable).toEqual(['broken.json']);

        const evaluation = evaluateWaiterStarvation({ledgerReading, now, degradeAfterMs: HOUR, leaseHolder: null});

        // One clean waiter under the bound beside one unreadable file: nothing breached, but the
        // reading cannot assert green — unknown, which never authorizes degradation.
        expect(evaluation.posture).toBe('unknown');
        expect(evaluation.degraded).toBe(false);
        expect(evaluation.waiterCount).toBe(1);
        expect(evaluation.unreadableCount).toBe(1);
    });

    test('a readable breach beside unreadable noise still degrades — readable evidence wins (#17049)', () => {
        const now        = 10 * HOUR;
        const evaluation = evaluateWaiterStarvation({
            ledgerReading: {
                waiters   : [waiterEntry({taskName: 'backup', deferredSince: new Date(now - 2 * HOUR).toISOString(), priorityZero: true})],
                unreadable: ['broken.json']
            },
            now,
            degradeAfterMs: HOUR,
            leaseHolder   : 'dream'
        });

        expect(evaluation.posture).toBe('degraded');
        expect(evaluation.breaches).toHaveLength(1);
        expect(evaluation.unreadableCount).toBe(1);
    });

    test('a fully corrupt ledger fails OPEN to green with the skip surfaced, never a throw (#17049 AC4)', () => {
        const now      = 10 * HOUR;
        const fsModule = {
            readdirSync : () => ['a.json', 'b.json'],
            readFileSync: () => '<<corrupt>>'
        };

        const ledgerReading = listActiveWaitersSync({leasePath: '/tmp/lease/heavy.lease', staleAfterMs: 6 * HOUR, fsModule, now});
        const evaluation    = evaluateWaiterStarvation({ledgerReading, now, degradeAfterMs: HOUR, leaseHolder: 'dream'});

        expect(evaluation.posture).toBe('unknown');
        expect(evaluation.degraded).toBe(false);
        expect(evaluation.waiterCount).toBe(0);
        expect(evaluation.unreadableCount).toBe(2);
    });

    test('a non-positive or non-finite bound disables the degrade — fail-open, never fail-loud', () => {
        const now     = 10 * HOUR;
        const starved = {waiters: [waiterEntry({taskName: 'backup', deferredSince: new Date(0).toISOString()})], unreadable: []};

        for (const degradeAfterMs of [0, -1, NaN, undefined]) {
            const evaluation = evaluateWaiterStarvation({ledgerReading: starved, now, degradeAfterMs});

            expect(evaluation.posture).toBe('disabled');
            expect(evaluation.degraded).toBe(false);
            expect(evaluation.breaches).toEqual([]);
        }
    });

    test('getDueTask fires on cadence and treats <= 0 as disabled', () => {
        expect(getDueTask({
            state                                    : {lastRunAt: 0},
            now                                      : 600000,
            heavyMaintenanceStarvationWatchdogCheckMs: 600000
        })).toEqual({
            taskName: 'heavy-maintenance-starvation-watchdog',
            source  : 'periodic-health-check',
            reason  : 'periodic-health-check:600000'
        });

        expect(getDueTask({
            state                                    : {lastRunAt: 0},
            now                                      : 599999,
            heavyMaintenanceStarvationWatchdogCheckMs: 600000
        })).toBeNull();

        expect(getDueTask({
            state                                    : {lastRunAt: 0},
            now                                      : 999999999,
            heavyMaintenanceStarvationWatchdogCheckMs: 0
        })).toBeNull();
    });
});
