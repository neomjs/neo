import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import os             from 'node:os';
import path           from 'node:path';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import {
    clearWaiterSync,
    findWaiterToYieldTo,
    listActiveWaitersSync,
    registerWaiterSync,
    resolveWaitersDir
} from '../../../../../../../ai/daemons/orchestrator/services/heavyMaintenanceWaiterLedger.mjs';
import {
    DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES,
    MaintenanceBackpressureService,
    WAITER_ENTRY_STALE_AFTER_MS,
    recordDeferral
} from '../../../../../../../ai/daemons/orchestrator/services/MaintenanceBackpressureService.mjs';
import {PRIORITY_ZERO_TASKS} from '../../../../../../../ai/daemons/orchestrator/scheduling/pipeline.mjs';

const T0   = Date.parse('2026-08-13T10:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const iso  = ms => new Date(ms).toISOString();

function tmpLeasePath() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waiter-ledger-'));
    return path.join(dir, 'heavy-maintenance-lease.json');
}

test.describe('Neo.ai.daemons.orchestrator.services.heavyMaintenanceWaiterLedger (#16561)', () => {

    test('register → list roundtrip carries the durable streak, and re-registering refreshes one entry', () => {
        const leasePath = tmpLeasePath();

        registerWaiterSync({leasePath, taskName: 'tenant-repo-sync', deferredSince: iso(T0 - 2 * HOUR), now: T0});
        registerWaiterSync({leasePath, taskName: 'tenant-repo-sync', deferredSince: iso(T0 - 2 * HOUR), now: T0 + 60_000});

        const {waiters, unreadable} = listActiveWaitersSync({leasePath, staleAfterMs: WAITER_ENTRY_STALE_AFTER_MS, now: T0 + 60_000});

        expect(unreadable).toEqual([]);
        expect(waiters).toHaveLength(1);
        expect(waiters[0]).toMatchObject({
            taskName     : 'tenant-repo-sync',
            priorityZero : false,
            deferredSince: iso(T0 - 2 * HOUR),
            updatedAt    : iso(T0 + 60_000)
        })
    });

    test('a silent waiter expires — a dead process cannot veto acquisitions forever', () => {
        const leasePath = tmpLeasePath();

        registerWaiterSync({leasePath, taskName: 'backup', priorityZero: true, deferredSince: iso(T0 - HOUR), now: T0});

        const fresh = listActiveWaitersSync({leasePath, staleAfterMs: WAITER_ENTRY_STALE_AFTER_MS, now: T0 + WAITER_ENTRY_STALE_AFTER_MS});
        const stale = listActiveWaitersSync({leasePath, staleAfterMs: WAITER_ENTRY_STALE_AFTER_MS, now: T0 + WAITER_ENTRY_STALE_AFTER_MS + 1});

        expect(fresh.waiters).toHaveLength(1);
        expect(stale.waiters).toHaveLength(0)
    });

    test('clear removes the entry and tolerates absence; a corrupt entry is reported, never thrown', () => {
        const leasePath = tmpLeasePath();

        registerWaiterSync({leasePath, taskName: 'dream', deferredSince: iso(T0), now: T0});
        clearWaiterSync({leasePath, taskName: 'dream'});
        clearWaiterSync({leasePath, taskName: 'dream'});

        fs.writeFileSync(path.join(resolveWaitersDir({leasePath}), 'garbage.json'), '{not json');

        const {waiters, unreadable} = listActiveWaitersSync({leasePath, staleAfterMs: WAITER_ENTRY_STALE_AFTER_MS, now: T0});

        expect(waiters).toHaveLength(0);
        expect(unreadable).toEqual(['garbage.json'])
    });

    test('an unmeasured wait must not register as a fresh one', () => {
        const leasePath = tmpLeasePath();

        expect(() => registerWaiterSync({leasePath, taskName: 'backup', deferredSince: undefined, now: T0})).toThrow(/durable ISO streak start/);
        expect(() => registerWaiterSync({leasePath, taskName: 'backup', deferredSince: 'not-a-date', now: T0})).toThrow(/durable ISO streak start/)
    });

    test.describe('findWaiterToYieldTo — the fairness decision matrix', () => {
        const bound = 30 * 60 * 1000;

        test('priority-0 waiter beats an ordinary acquirer regardless of streak age', () => {
            const waiters = [{taskName: 'backup', priorityZero: true, deferredSince: iso(T0 - 60_000)}];

            expect(findWaiterToYieldTo({taskName: 'dream', waiters, fairnessYieldAfterMs: bound, now: T0})?.taskName).toBe('backup')
        });

        test('an ordinary waiter starving past the bound beats a fresh acquirer', () => {
            const waiters = [{taskName: 'tenant-repo-sync', priorityZero: false, deferredSince: iso(T0 - bound)}];

            expect(findWaiterToYieldTo({taskName: 'dream', waiters, fairnessYieldAfterMs: bound, now: T0})?.taskName).toBe('tenant-repo-sync')
        });

        test('the waiter itself proceeds — self-entries never force a yield', () => {
            const waiters = [{taskName: 'tenant-repo-sync', priorityZero: false, deferredSince: iso(T0 - 2 * HOUR)}];

            expect(findWaiterToYieldTo({taskName: 'tenant-repo-sync', waiters, fairnessYieldAfterMs: bound, now: T0})).toBeNull()
        });

        test('an acquirer with the OLDER streak does not yield to a younger starving waiter', () => {
            const waiters = [{taskName: 'summary', priorityZero: false, deferredSince: iso(T0 - bound)}];

            expect(findWaiterToYieldTo({
                taskName: 'tenant-repo-sync', ownDeferredSince: iso(T0 - 2 * HOUR),
                waiters, fairnessYieldAfterMs: bound, now: T0
            })).toBeNull()
        });

        test('fresh same-class waiters do not force a yield — ordinary contention handles peers', () => {
            const waiters = [{taskName: 'summary', priorityZero: false, deferredSince: iso(T0 - 60_000)}];

            expect(findWaiterToYieldTo({taskName: 'dream', waiters, fairnessYieldAfterMs: bound, now: T0})).toBeNull()
        });

        test('the OLDEST qualifying waiter wins when several qualify', () => {
            const waiters = [
                {taskName: 'summary',          priorityZero: false, deferredSince: iso(T0 - bound - 1)},
                {taskName: 'tenant-repo-sync', priorityZero: false, deferredSince: iso(T0 - 3 * HOUR)}
            ];

            expect(findWaiterToYieldTo({taskName: 'dream', waiters, fairnessYieldAfterMs: bound, now: T0})?.taskName).toBe('tenant-repo-sync')
        });

        test('a bootstrap-critical waiter beats an ordinary acquirer IMMEDIATELY — no starvation bound', () => {
            const waiters = [{taskName: 'tenant-repo-sync', bootstrapCritical: true, deferredSince: iso(T0 - 60_000)}];

            expect(findWaiterToYieldTo({taskName: 'dream', waiters, fairnessYieldAfterMs: bound, now: T0})?.taskName).toBe('tenant-repo-sync')
        });

        test('a bootstrap-critical waiter does not preempt a priority-0 acquirer', () => {
            const waiters = [{taskName: 'tenant-repo-sync', bootstrapCritical: true, deferredSince: iso(T0 - 60_000)}];

            expect(findWaiterToYieldTo({taskName: 'backup', priorityZero: true, waiters, fairnessYieldAfterMs: bound, now: T0})).toBeNull()
        });

        // Mixed-rank negatives. The original matrix tested each `outranks*` arm in isolation and
        // every arm was green, but the arms were ORed and then resolved by oldest-wins — so age
        // could promote a LOWER-ranked waiter across the class boundary. Each case below fails
        // against that shape and passes only when rank is evaluated strictly before age.
        test('an ancient ORDINARY waiter never preempts a priority-0 acquirer — age must not cross rank', () => {
            const waiters = [{taskName: 'summary', priorityZero: false, deferredSince: iso(T0 - 12 * HOUR)}];

            expect(findWaiterToYieldTo({
                taskName: 'backup', priorityZero: true,
                waiters, fairnessYieldAfterMs: bound, now: T0
            })).toBeNull()
        });

        test('an ancient ORDINARY waiter never preempts a bootstrap-critical acquirer', () => {
            const waiters = [{taskName: 'summary', priorityZero: false, deferredSince: iso(T0 - 12 * HOUR)}];

            expect(findWaiterToYieldTo({
                taskName: 'tenant-repo-sync', bootstrapCritical: true,
                waiters, fairnessYieldAfterMs: bound, now: T0
            })).toBeNull()
        });

        test('a YOUNGER priority-0 waiter outranks an older ordinary one — rank first, age only within rank', () => {
            const waiters = [
                {taskName: 'summary', priorityZero: false, deferredSince: iso(T0 - 6 * HOUR)},
                {taskName: 'backup',  priorityZero: true,  deferredSince: iso(T0 - 30_000)}
            ];

            expect(findWaiterToYieldTo({taskName: 'dream', waiters, fairnessYieldAfterMs: bound, now: T0})?.taskName).toBe('backup')
        });

        test('age still breaks ties WITHIN a rank — oldest of two qualifying priority-0 waiters wins', () => {
            const waiters = [
                {taskName: 'backup',       priorityZero: true, deferredSince: iso(T0 - 60_000)},
                {taskName: 'other-backup', priorityZero: true, deferredSince: iso(T0 - 5 * HOUR)}
            ];

            expect(findWaiterToYieldTo({taskName: 'dream', waiters, fairnessYieldAfterMs: bound, now: T0})?.taskName).toBe('other-backup')
        });

        test('bootstrap-critical acquirer vs bootstrap-critical waiter falls through to the age rule', () => {
            const waiters = [{taskName: 'other-bootstrap', bootstrapCritical: true, deferredSince: iso(T0 - 60_000)}];

            expect(findWaiterToYieldTo({
                taskName: 'tenant-repo-sync', bootstrapCritical: true,
                waiters, fairnessYieldAfterMs: bound, now: T0
            })).toBeNull()
        })
    });

    test.describe('isBootstrapCriticalTask — the durable-manifest predicate', () => {

        function serviceWithManifest(manifest) {
            const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-critical-'));

            if (manifest !== undefined) {
                fs.writeFileSync(path.join(dataDir, 'tenant-repo-sync-revisions.json'), manifest);
            }

            return Neo.create(MaintenanceBackpressureService, {dataDir, writeLog: () => {}});
        }

        test('an uncheckpointed seeded repo makes tenant sync bootstrap-critical; full checkpoints end it', () => {
            const pending = serviceWithManifest(JSON.stringify({revisions: {
                'a/one': {lastIngestedRev: 'abc123'},
                'a/two': {lastIngestedRev: null}
            }}));
            const complete = serviceWithManifest(JSON.stringify({revisions: {
                'a/one': {lastIngestedRev: 'abc123'},
                'a/two': {lastIngestedRev: 'def456'}
            }}));

            expect(pending.isBootstrapCriticalTask('tenant-repo-sync')).toBe(true);
            expect(pending.isBootstrapCriticalTask('dream')).toBe(false);
            expect(complete.isBootstrapCriticalTask('tenant-repo-sync')).toBe(false);
            pending.destroy();
            complete.destroy()
        });

        test('an absent or corrupt manifest never grants priority', () => {
            const absent  = serviceWithManifest(undefined);
            const corrupt = serviceWithManifest('{not json');

            expect(absent.isBootstrapCriticalTask('tenant-repo-sync')).toBe(false);
            expect(corrupt.isBootstrapCriticalTask('tenant-repo-sync')).toBe(false);
            absent.destroy();
            corrupt.destroy()
        });

        // Configured coverage, not the manifest alone, decides the class. The manifest only records
        // what the sync lane has already seen, so a manifest-only predicate reads "ordinary" in the
        // three states below — including a first deployment, which is when the class matters most.
        function serviceWithCoverage(manifest, labels) {
            const service = serviceWithManifest(manifest);

            // Seed the snapshot directly and stamp it fresh so the throttle suppresses a live
            // resolver call; the refresh path itself is covered by its own arm below.
            service.configuredTenantRepoLabels   = labels;
            service.configuredTenantRepoLabelsAt = Date.now();

            return service
        }

        test('first deployment — configured repos with no manifest at all is bootstrap-critical', () => {
            const service = serviceWithCoverage(undefined, ['a/one', 'a/two']);

            expect(service.isBootstrapCriticalTask('tenant-repo-sync')).toBe(true);
            service.destroy()
        });

        test('a newly added repo absent from an existing manifest is bootstrap-critical', () => {
            const service = serviceWithCoverage(
                JSON.stringify({revisions: {'a/one': {lastIngestedRev: 'abc123'}}}),
                ['a/one', 'a/two']
            );

            expect(service.isBootstrapCriticalTask('tenant-repo-sync')).toBe(true);
            service.destroy()
        });

        test('a removed repo\'s stale null entry no longer grants priority', () => {
            const service = serviceWithCoverage(
                JSON.stringify({revisions: {
                    'a/one' : {lastIngestedRev: 'abc123'},
                    'a/gone': {lastIngestedRev: null}
                }}),
                ['a/one']
            );

            expect(service.isBootstrapCriticalTask('tenant-repo-sync')).toBe(false);
            service.destroy()
        });

        test('an empty configured set is ordinary even with a stale null-bearing manifest', () => {
            const service = serviceWithCoverage(
                JSON.stringify({revisions: {'a/gone': {lastIngestedRev: null}}}),
                []
            );

            expect(service.isBootstrapCriticalTask('tenant-repo-sync')).toBe(false);
            service.destroy()
        });

        test('an unresolved snapshot falls back to the manifest-only predicate', () => {
            const service = serviceWithManifest(JSON.stringify({revisions: {'a/two': {lastIngestedRev: null}}}));

            expect(service.configuredTenantRepoLabels).toBeNull();
            expect(service.isBootstrapCriticalTask('tenant-repo-sync')).toBe(true);
            service.destroy()
        });

        test('the snapshot refresh populates labels from the canonical resolver seam', async () => {
            const service = serviceWithManifest(JSON.stringify({revisions: {'a/one': {lastIngestedRev: 'abc123'}}}));

            service.resolveConfiguredTenantRepoLabelsFn = async () => ['a/one', 'a/two'];
            service.refreshConfiguredTenantRepoLabels();
            await new Promise(resolve => setImmediate(resolve));

            expect(service.configuredTenantRepoLabels).toEqual(['a/one', 'a/two']);
            // 'a/two' is configured and uncheckpointed, so coverage now grants the class.
            expect(service.isBootstrapCriticalTask('tenant-repo-sync')).toBe(true);
            service.destroy()
        });

        test('a failing resolver keeps the previous snapshot instead of downgrading coverage', async () => {
            const service = serviceWithCoverage(undefined, ['a/one']);

            service.resolveConfiguredTenantRepoLabelsFn = async () => { throw new Error('resolver down') };
            service.configuredTenantRepoLabelsAt        = 0;
            service.refreshConfiguredTenantRepoLabels();
            await new Promise(resolve => setImmediate(resolve));

            expect(service.configuredTenantRepoLabels).toEqual(['a/one']);
            expect(service.isBootstrapCriticalTask('tenant-repo-sync')).toBe(true);
            service.destroy()
        })
    });

    test('drift tripwire: the service priority-class mirror equals the scheduling module truth', () => {
        const service = Neo.create(MaintenanceBackpressureService, {writeLog: () => {}});

        expect([...service.priorityZeroTaskNames].sort()).toEqual([...PRIORITY_ZERO_TASKS].sort());
        service.destroy()
    });

    test('module recordDeferral returns the outcome payload carrying the durable streak', () => {
        const payload = recordDeferral({
            deferralLogKeys : new Set(),
            taskName        : 'tenant-repo-sync',
            reasonCode      : 'heavy-maintenance-lease-held',
            reasonText      : 'scheduled',
            holdingLease    : {owner: 'dream', pid: 1},
            taskStateService: {markDeferred: () => iso(T0 - 2 * HOUR)}
        });

        expect(payload.deferredSince).toBe(iso(T0 - 2 * HOUR));
        expect(payload.holdingOwner).toBe('dream')
    });

    test.describe('acquireLeaseAndExecute integration — the gate at the single acquisition point', () => {

        function buildService({leasePath, taskState = {}, acquireResult, dataDir}) {
            const outcomes = [];
            const service  = Neo.create(MaintenanceBackpressureService, {
                heavyMaintenanceTaskNames: DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES,
                writeLog                 : () => {},
                dataDir                  : dataDir ?? null,
                healthService            : {recordTaskOutcome: (name, status, payload) => outcomes.push({name, status, payload})},
                taskStateService         : {
                    getTaskState: name => taskState[name] ?? null,
                    markDeferred: name => taskState[name]?.deferralStreakStartedAt ?? null
                },
                acquireLeaseFn: () => acquireResult,
                releaseLeaseFn: () => {}
            });

            service.resolveHeavyMaintenanceLeasePath = () => leasePath;
            return {service, outcomes};
        }

        test('an acquirer yields to a registered starving waiter and records the deferral', () => {
            const leasePath = tmpLeasePath();

            registerWaiterSync({leasePath, taskName: 'tenant-repo-sync', deferredSince: iso(Date.now() - 2 * HOUR), now: Date.now()});

            const {service, outcomes} = buildService({leasePath, acquireResult: {acquired: true, lease: {token: 't1'}}});
            const executed            = [];

            const result = service.acquireLeaseAndExecute({
                taskName       : 'dream',
                executeFn      : name => { executed.push(name); return true; },
                reason         : 'scheduled',
                activeHeavyTask: {name: null}
            });

            expect(result).toBe(false);
            expect(executed).toEqual([]);
            expect(outcomes.some(o => o.payload?.reasonCode === 'heavy-maintenance-yield-to-waiter' && o.payload?.blockingTaskName === 'tenant-repo-sync')).toBe(true);
            service.destroy()
        });

        test('the starving waiter itself acquires, runs, and its ledger entry clears', () => {
            const leasePath = tmpLeasePath();
            const since     = iso(Date.now() - 2 * HOUR);

            registerWaiterSync({leasePath, taskName: 'tenant-repo-sync', deferredSince: since, now: Date.now()});

            const {service} = buildService({
                leasePath,
                taskState    : {'tenant-repo-sync': {deferralStreakStartedAt: since}},
                acquireResult: {acquired: true, lease: {token: 't2'}}
            });
            const executed = [];

            const result = service.acquireLeaseAndExecute({
                taskName       : 'tenant-repo-sync',
                executeFn      : name => { executed.push(name); return true; },
                reason         : 'scheduled',
                activeHeavyTask: {name: null}
            });

            expect(result).toBe(true);
            expect(executed).toEqual(['tenant-repo-sync']);

            const {waiters} = listActiveWaitersSync({leasePath, staleAfterMs: WAITER_ENTRY_STALE_AFTER_MS, now: Date.now()});
            expect(waiters).toHaveLength(0);
            service.destroy()
        });

        test('a lease-held deferral with a measurable streak registers the waiter durably — carrying its bootstrap class', () => {
            const leasePath = tmpLeasePath();
            const since     = iso(Date.now() - HOUR);
            const dataDir   = path.dirname(leasePath);

            fs.writeFileSync(
                path.join(dataDir, 'tenant-repo-sync-revisions.json'),
                JSON.stringify({revisions: {'a/one': {lastIngestedRev: null}}})
            );

            const {service} = buildService({
                leasePath,
                dataDir,
                taskState    : {'tenant-repo-sync': {deferralStreakStartedAt: since}},
                acquireResult: {acquired: false, lease: {owner: 'dream', pid: 42}}
            });

            const result = service.acquireLeaseAndExecute({
                taskName       : 'tenant-repo-sync',
                executeFn      : () => true,
                reason         : 'scheduled',
                activeHeavyTask: {name: null}
            });

            expect(result).toBe(false);

            const {waiters} = listActiveWaitersSync({leasePath, staleAfterMs: WAITER_ENTRY_STALE_AFTER_MS, now: Date.now()});
            expect(waiters).toHaveLength(1);
            expect(waiters[0]).toMatchObject({taskName: 'tenant-repo-sync', deferredSince: since, bootstrapCritical: true});
            service.destroy()
        })
    })
});
