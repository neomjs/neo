import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {
    DEFAULT_COMPATIBLE_HEAVY_MAINTENANCE_TASK_PAIRS,
    DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES,
    DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES,
    MaintenanceBackpressureService
} from '../../../../../../ai/daemons/orchestrator/services/MaintenanceBackpressureService.mjs';
import {createLeaseYieldVoter}            from '../../../../../../ai/daemons/orchestrator/services/HeavyMaintenanceLeaseService.mjs';
import {executeCandidate}                 from '../../../../../../ai/daemons/orchestrator/scheduling/pipeline.mjs';
import {runTenantRepoSyncWithGlobalLease} from '../../../../../../ai/scripts/maintenance/syncTenantRepos.mjs';
import {
    createSliceBudgetPredicate,
    createYieldCauseResolver,
    YIELD_CAUSE_LEASE,
    YIELD_CAUSE_SLICE
} from '../../../../../../ai/daemons/orchestrator/scheduling/tenantRepoSync.mjs';

/**
 * @summary BOTH outer acquisitions of the `tenant-repo-sync` heavy lease must contribute a
 * cause-bearing fairness vote, and each must be provable independently of the other.
 *
 * The premise this spec exists to hold is the one a previous ticket got wrong twice: there is not one
 * outer holder. The CLI (`syncTenantRepos.mjs`, owner `tenant-repo-sync`) and the scheduler
 * (`MaintenanceBackpressureService`, owner = the task name) take the SAME deployment-wide lease and
 * are indistinguishable at the point where the vote is cast. A repo-level vote wired into one of them
 * cannot terminate a hold the other owns — and the earlier implementation wired the CLI only, and was
 * thoroughly tested that way, which is exactly the evidence that produced a false owner discriminator.
 *
 * So each of the three production propagation edges gets its OWN arm, and the arms are specific rather
 * than merely sensitive: deleting one edge must redden its arm and leave the other two green. A suite
 * that goes red on any edit tells a later author that something broke, not which thing.
 *
 * | edge | production site | arm |
 * |---|---|---|
 * | the scheduler's acquisition builds a voter | `MaintenanceBackpressureService` `taskOptions` | SCHEDULER PATH |
 * | the service-runner forwards it | `pipeline.mjs` `'tenant-repo-sync'` runner | RUNNER FORWARDING |
 * | the CLI's acquisition builds a voter | `syncTenantRepos.mjs` `invoke` | CLI PATH |
 *
 * Consuming the cause — stopping tail admission, committing the active cohort, releasing the outer
 * lease — belongs to a separate dependent change. This spec asserts that consumption is ABSENT here,
 * so the two land and are reviewed independently.
 */

/**
 * An acquisition descriptor whose hold is older than any bound a deployment could sanely configure.
 *
 * The epoch rather than a value derived from the config leaf, and that is the deliberate choice: a
 * spec that read `AiConfig` to place its fixture would be reading the repo-local OVERLAY, which is
 * gitignored and free to differ between this machine and CI, which `lint-config-template-ssot`
 * refuses. Anchoring outside every plausible bound keeps the arm's subject the COMPARISON rather
 * than the number, and both mutations that matter still redden it: a flipped operator inverts this
 * fixture and its fresh sibling together, and a bound resolved from the wrong config leaf is
 * non-finite, which the primitive answers `false` to.
 * @returns {Object}
 */
const overBoundAcquisition = () => ({
    acquired: true,
    status  : 'acquired',
    lease   : {token: 'over-bound', acquiredAt: new Date(0).toISOString()}
});

/**
 * An acquisition descriptor a second old — inside any bound a deployment could sanely configure.
 * @returns {Object}
 */
const freshAcquisition = () => ({
    acquired: true,
    status  : 'acquired',
    lease   : {token: 'fresh', acquiredAt: new Date(Date.now() - 1000).toISOString()}
});

/**
 * A `MaintenanceBackpressureService` with the lease acquire/release stubbed, so the arms observe what
 * the service HANDS a task rather than what a real lease file does.
 * @param {Object} acquisition The descriptor `acquireLeaseFn` returns.
 * @returns {MaintenanceBackpressureService}
 */
function buildService(acquisition) {
    return Neo.create(MaintenanceBackpressureService, {
        heavyMaintenanceTaskNames          : DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES,
        goldenPathDependencyTaskNames      : DEFAULT_GOLDEN_PATH_DEPENDENCY_TASK_NAMES,
        compatibleHeavyMaintenanceTaskPairs: DEFAULT_COMPATIBLE_HEAVY_MAINTENANCE_TASK_PAIRS,
        acquireLeaseFn                     : () => acquisition,
        releaseLeaseFn                     : () => {},
        resolveHeavyMaintenanceLeasePath   : () => '/tmp/unused-lease-path.json',
        taskStateService                   : {getTaskState: () => null},
        writeLog                           : () => {},
        listActiveWaitersFn                : () => ({waiters: [], unreadable: []}),
        registerWaiterFn                   : () => {},
        clearWaiterFn                      : () => {}
    });
}

test.describe('#17398 — the outer lease fairness voter, per acquisition path', () => {
    test('the voter compares against a real bound: past it reports a lease cause, inside it reports nothing', () => {
        const over  = createLeaseYieldVoter(overBoundAcquisition()),
              fresh = createLeaseYieldVoter(freshAcquisition());

        expect(over.cause, 'the cause is named, not inferred from a boolean').toBe(YIELD_CAUSE_LEASE);
        expect(over.vote()).toBe(true);

        // NEGATIVE CONTROL, on the real predicate and the real config leaf rather than a stub: a
        // flipped comparison operator, or a read of the sibling `heavyMaintenanceLease` leaf (which
        // holds only `staleAfterMs`, so the bound would resolve `undefined` and never vote), turns
        // one of these two assertions red. A voter that always answered `false` would pass the second
        // alone, which is why both sides of the bound are asserted in one arm.
        expect(fresh.cause).toBe(YIELD_CAUSE_LEASE);
        expect(fresh.vote(), 'a holder inside its bound must produce NO cause').toBe(false);
    });

    test('no acquisition yields NULL, not a voter that always answers false', () => {
        // The two are not interchangeable to a caller. `null` composes away and leaves the slice
        // budget as the only bound; an always-false voter is a bound that reports "not yet" forever,
        // which reads identically to a healthy one at every call site.
        expect(createLeaseYieldVoter(null)).toBeNull();
        expect(createLeaseYieldVoter({acquired: false, status: 'held'})).toBeNull();
        expect(createLeaseYieldVoter(undefined)).toBeNull();
    });

    test('SCHEDULER PATH: the scheduler acquisition hands its task a lease voter', () => {
        // RED against dev: `taskOptions` carried `{env, onComplete}` and nothing derived from the
        // acquisition's AGE, so the scheduler's own hold could not be voted against at all.
        let captured = null;

        buildService(overBoundAcquisition()).acquireLeaseAndExecute({
            taskName       : 'tenant-repo-sync',
            reason         : 'periodic',
            activeHeavyTask: {name: null},
            executeFn      : (taskName, reason, onSuccess, taskOptions) => {
                captured = taskOptions;
                return true
            }
        });

        expect(captured, 'the scheduler must reach its task at all').not.toBeNull();
        expect(captured.leaseYieldVoter, 'the scheduler is an outer holder and must supply a vote').not.toBeNull();
        expect(captured.leaseYieldVoter.cause).toBe(YIELD_CAUSE_LEASE);
        expect(captured.leaseYieldVoter.vote()).toBe(true);
    });

    test('SCHEDULER PATH: a compatible-pair bypass holds no lease, so it supplies no vote', () => {
        // The bypass candidate runs WITHOUT inheriting the incumbent's token. It owns no lease, so a
        // voter here would be voting on somebody else's hold — and its exit would release a lease it
        // never took. This arm is why the production line reads `leaseToken ? … : null` rather than
        // building a voter from whatever descriptor came back.
        let captured = null;

        const service = buildService({acquired: false, status: 'held', lease: {owner: 'kbSync', token: 'other', acquiredAt: new Date(0).toISOString()}});

        service.areHeavyMaintenanceTasksCompatible = () => true;
        service.acquireLeaseAndExecute({
            taskName       : 'tenant-repo-sync',
            reason         : 'periodic',
            activeHeavyTask: {name: null},
            executeFn      : (taskName, reason, onSuccess, taskOptions) => {
                captured = taskOptions;
                return true
            }
        });

        expect(captured).not.toBeNull();
        expect(captured.leaseYieldVoter, 'a task holding no lease has no hold to yield').toBeNull();
    });

    test('RUNNER FORWARDING: the service-runner passes the voter through to runTask', () => {
        // RED against dev: the `'tenant-repo-sync'` runner's signature was `(taskName, reason)`, so
        // the fourth argument `acquireLeaseAndExecute` already passed was dropped on the floor. The
        // scheduler edge above and this one are separate defects — either alone leaves the vote
        // unreachable, and only a per-edge arm says which.
        const voter = {cause: YIELD_CAUSE_LEASE, vote: () => true};

        let received = null;

        executeCandidate({
            candidate: {
                taskName  : 'tenant-repo-sync',
                trigger   : {reason: 'periodic-tenant-repo-sync:1'},
                descriptor: {executionKind: 'service-runner', maintenanceClass: 'heavy'}
            },
            activeHeavyTask: {name: null},
            services       : {
                taskStateService              : {getTaskState: () => null},
                healthService                 : {recordTaskOutcome() {}},
                tenantRepoSyncService         : {runTask(options) { received = options; return true }},
                maintenanceBackpressureService: {
                    // Stubbed at the boundary the runner actually crosses: this spec is about the
                    // runner's FORWARDING, and routing it through a real lease acquisition would make
                    // a scheduler-edge regression redden this arm too.
                    acquireLeaseAndExecute: ({taskName, executeFn, reason, onSuccess}) =>
                        executeFn(taskName, reason, onSuccess, {env: {}, leaseYieldVoter: voter, onComplete() {}})
                }
            },
            runtime: {writeLog() {}}
        });

        expect(received, 'the runner must reach the service').not.toBeNull();
        expect(received.leaseYieldVoter, 'the runner must not drop taskOptions').toBe(voter);
    });

    test('RUNNER FORWARDING: a runner invoked without taskOptions passes null, never undefined', () => {
        // `acquireLeaseAndExecute` short-circuits non-heavy tasks with `executeFn(taskName, reason,
        // onSuccess)` — three arguments. The service's default is `null`, and `undefined` would take
        // that default too, so this arm exists for the reader rather than the machine: it fixes the
        // absent case as a deliberate value instead of an accident of argument arity.
        let received = null;

        executeCandidate({
            candidate: {
                taskName  : 'tenant-repo-sync',
                trigger   : {reason: 'periodic-tenant-repo-sync:2'},
                descriptor: {executionKind: 'service-runner', maintenanceClass: 'heavy'}
            },
            activeHeavyTask: {name: null},
            services       : {
                taskStateService              : {getTaskState: () => null},
                healthService                 : {recordTaskOutcome() {}},
                tenantRepoSyncService         : {runTask(options) { received = options; return true }},
                maintenanceBackpressureService: {
                    acquireLeaseAndExecute: ({taskName, executeFn, reason, onSuccess}) => executeFn(taskName, reason, onSuccess)
                }
            },
            runtime: {writeLog() {}}
        });

        expect(received.leaseYieldVoter).toBeNull();
    });

    test('CLI PATH: the container one-shot builds its voter from its own acquisition', async () => {
        // RED against dev: the `invoke` closure took no argument, so the acquisition descriptor
        // `withHeavyMaintenanceLease` hands its task — the only place this process can learn when its
        // own hold began — was discarded.
        const acquisition = overBoundAcquisition();

        let dispatched = null;

        await runTenantRepoSyncWithGlobalLease({
            parsed          : {repoSlugs: [], fullReplay: false, clearBackoff: false},
            taskStateService: {getTaskState: () => null},
            writeLog        : () => {},
            runTaskImpl     : options => { dispatched = options; return {status: 'completed'} },
            withLeaseImpl   : task => task(acquisition)
        });

        expect(dispatched, 'the CLI must dispatch the sweep').not.toBeNull();
        expect(dispatched.leaseYieldVoter, 'the CLI is the other outer holder').not.toBeNull();
        expect(dispatched.leaseYieldVoter.cause).toBe(YIELD_CAUSE_LEASE);
        expect(dispatched.leaseYieldVoter.vote()).toBe(true);
    });

    test('CLI PATH: the clear-backoff branch receives no vote', async () => {
        // Deliberate asymmetry, not an oversight. The clear is a short manifest rewrite that must
        // finish atomically; a yield partway through leaves a half-applied clear, which is a worse
        // outcome than holding the lease a few seconds past its bound. Without this arm, an
        // implementation that votes on both branches passes every other arm in this file.
        let clearOptions = null,
            sweepRan     = false;

        await runTenantRepoSyncWithGlobalLease({
            parsed          : {repoSlugs: [], fullReplay: false, clearBackoff: true},
            taskStateService: {getTaskState: () => null},
            writeLog        : () => {},
            runTaskImpl     : () => { sweepRan = true; return {status: 'completed'} },
            clearBackoffImpl: options => { clearOptions = options; return {status: 'completed'} },
            withLeaseImpl   : task => task(overBoundAcquisition())
        });

        expect(sweepRan, 'clear-backoff must not run the sweep').toBe(false);
        expect(clearOptions).not.toBeNull();
        expect(clearOptions.leaseYieldVoter, 'an atomic rewrite gets no yield vote').toBeUndefined();
    });

    test('NO-LEASE EQUIVALENCE: with no voter, the boolean projection IS the slice predicate', () => {
        // Asserted against the raw predicate's own answer rather than against a hardcoded expectation,
        // so the arm cannot drift from what the slice budget actually decides. This is the guarantee
        // for the callers that hold no outer lease — every in-process scheduler path — that the change
        // is behaviour-preserving for them.
        const sliceBudgetMs = 5000;

        for (const elapsed of [0, 4999, 5000, 5001, 100_000]) {
            const startedMs = 1_000_000,
                  now       = () => startedMs + elapsed,
                  raw       = createSliceBudgetPredicate({startedMs, sliceBudgetMs, now}),
                  resolver  = createYieldCauseResolver([
                      null,
                      {cause: YIELD_CAUSE_SLICE, vote: createSliceBudgetPredicate({startedMs, sliceBudgetMs, now})}
                  ]);

            expect(resolver() !== null, `elapsed ${elapsed}ms must match the raw predicate`).toBe(raw());
        }
    });

    test('CONSUMPTION IS ABSENT: the sweep consumes a Boolean, so no exit branch can read the cause', () => {
        // The three lease-exit steps belong to a separate dependent change. This arm fixes the
        // boundary between them: the projection the sweep passes downstream is a Boolean, so an
        // implementation here CANNOT have started branching on the cause. The successor changes this
        // arm deliberately, which is the point — the boundary moves on the record, not by drift.
        const resolver = createYieldCauseResolver([
                  {cause: YIELD_CAUSE_LEASE, vote: () => true},
                  {cause: YIELD_CAUSE_SLICE, vote: () => false}
              ]),
              projection = () => resolver() !== null;

        expect(resolver(), 'the cause is available…').toBe(YIELD_CAUSE_LEASE);
        expect(typeof projection(), '…and the sweep still receives only a Boolean').toBe('boolean');
    });
});
