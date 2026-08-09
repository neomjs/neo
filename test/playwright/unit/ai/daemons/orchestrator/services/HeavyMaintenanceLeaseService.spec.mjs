import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import path           from 'path';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import {
    HeavyMaintenanceLeaseService,
    LIFECYCLE_GUARD_SUFFIX,
    acquireHeavyMaintenanceLease as _rawAcquireHeavyMaintenanceLease,
    acquireHeavyMaintenanceLeaseSync as _rawAcquireHeavyMaintenanceLeaseSync,
    buildLeasePayload,
    inspectHeavyMaintenanceLease,
    inspectHeavyMaintenanceLeaseSync,
    isPidAlive,
    isLeaseStale,
    releaseHeavyMaintenanceLease,
    releaseHeavyMaintenanceLeaseSync,
    renewHeavyMaintenanceLease,
    renewHeavyMaintenanceLeaseSync,
    resolveHeavyMaintenanceLeasePath,
    shouldYieldHeavyMaintenanceLease,
    withHeavyMaintenanceLease as _rawWithHeavyMaintenanceLease
} from '../../../../../../../ai/daemons/orchestrator/services/HeavyMaintenanceLeaseService.mjs';
import {
    enterLifecycleGuard,
    enterLifecycleGuardSync,
    exitLifecycleGuard,
    exitLifecycleGuardSync
} from '../../../../../../../ai/daemons/shared/lifecycleGuard.mjs';

// Test convenience: the lease primitive now requires `staleAfterMs` (the AiConfig-aware boundary
// resolves it; the Neo/Base-free primitive carries no default). These suites exercise
// acquire/release/stale/inheritance semantics — not the TTL value — so they default a valid TTL
// here; the required-`staleAfterMs` contract itself is covered by the dedicated guard test below.
const TEST_LEASE_STALE_MS = 60000;

const acquireHeavyMaintenanceLease = ({staleAfterMs = TEST_LEASE_STALE_MS, ...rest} = {}) =>
    _rawAcquireHeavyMaintenanceLease({staleAfterMs, ...rest});

const acquireHeavyMaintenanceLeaseSync = ({staleAfterMs = TEST_LEASE_STALE_MS, ...rest} = {}) =>
    _rawAcquireHeavyMaintenanceLeaseSync({staleAfterMs, ...rest});

const withHeavyMaintenanceLease = (task, {staleAfterMs = TEST_LEASE_STALE_MS, ...rest} = {}) =>
    _rawWithHeavyMaintenanceLease(task, {staleAfterMs, ...rest});

function createLeasePath(name) {
    const dir = path.join(process.cwd(), 'tmp', `heavy-maintenance-lease-${process.pid}-${Date.now()}-${Math.random()}`);
    fs.ensureDirSync(dir);
    return path.join(dir, `${name}.json`);
}

// Windows reports EPERM when rename targets an existing directory, while POSIX reports EEXIST.
// Keep the production fs seam untouched and normalize only this test's real-guard contention path.
const contentionFs = {
    ...fs,
    rename: async (...args) => {
        try {
            return await fs.rename(...args);
        } catch (error) {
            if (error.code === 'EPERM' && fs.pathExistsSync(args[1])) error.code = 'EEXIST';
            throw error;
        }
    },
    renameSync: (...args) => {
        try {
            return fs.renameSync(...args);
        } catch (error) {
            if (error.code === 'EPERM' && fs.pathExistsSync(args[1])) error.code = 'EEXIST';
            throw error;
        }
    }
};

async function withHeldLifecycleGuard(leasePath, callback) {
    const guardEntry = await enterLifecycleGuard({leasePath, fsModule: contentionFs});
    expect(guardEntry).toBeTruthy();

    try {
        return await callback();
    } finally {
        await exitLifecycleGuard({ownerFilePath: guardEntry.ownerFilePath, fsModule: contentionFs});
    }
}

function withHeldLifecycleGuardSync(leasePath, callback) {
    const guardEntry = enterLifecycleGuardSync({leasePath, fsModule: contentionFs});
    expect(guardEntry).toBeTruthy();

    try {
        return callback();
    } finally {
        exitLifecycleGuardSync({ownerFilePath: guardEntry.ownerFilePath, fsModule: contentionFs});
    }
}

test.describe('Neo.ai.daemons.services.HeavyMaintenanceLeaseService (#11505)', () => {
    test('#16027: pure path resolution requires an explicit path or absolute injected dataDir', () => {
        const dataDir = path.join(process.cwd(), 'tmp', 'relocated-orchestrator');

        expect(resolveHeavyMaintenanceLeasePath({
            leasePath: 'caller-owned-relative-override.json',
            dataDir  : 'relative-data-dir'
        })).toBe('caller-owned-relative-override.json');
        expect(resolveHeavyMaintenanceLeasePath({dataDir}))
            .toBe(path.join(dataDir, 'heavy-maintenance-lease.json'));
        expect(() => resolveHeavyMaintenanceLeasePath()).toThrow(/leasePath or an absolute dataDir is required/);
        expect(() => resolveHeavyMaintenanceLeasePath({dataDir: 'relative-data-dir'}))
            .toThrow(/leasePath or an absolute dataDir is required/);
    });

    test('#16027: every pure operation rejects a missing path before filesystem access', async () => {
        const fsNever = new Proxy({}, {
            get() {
                throw new Error('filesystem access occurred before path validation');
            }
        });
        const pathError = /leasePath or an absolute dataDir is required/;

        await expect(inspectHeavyMaintenanceLease({fsModule: fsNever})).rejects.toThrow(pathError);
        expect(() => inspectHeavyMaintenanceLeaseSync({fsModule: fsNever})).toThrow(pathError);
        await expect(_rawAcquireHeavyMaintenanceLease({
            fsModule    : fsNever,
            owner       : 'summary',
            staleAfterMs: TEST_LEASE_STALE_MS
        })).rejects.toThrow(pathError);
        expect(() => _rawAcquireHeavyMaintenanceLeaseSync({
            fsModule    : fsNever,
            owner       : 'summary',
            staleAfterMs: TEST_LEASE_STALE_MS
        })).toThrow(pathError);
        await expect(releaseHeavyMaintenanceLease({
            fsModule: fsNever,
            token   : 'missing-path'
        })).rejects.toThrow(pathError);
        expect(() => releaseHeavyMaintenanceLeaseSync({
            fsModule: fsNever,
            token   : 'missing-path'
        })).toThrow(pathError);
        await expect(renewHeavyMaintenanceLease({
            fsModule    : fsNever,
            staleAfterMs: TEST_LEASE_STALE_MS,
            token       : 'missing-path'
        })).rejects.toThrow(pathError);
        expect(() => renewHeavyMaintenanceLeaseSync({
            fsModule    : fsNever,
            staleAfterMs: TEST_LEASE_STALE_MS,
            token       : 'missing-path'
        })).toThrow(pathError);
        await expect(_rawWithHeavyMaintenanceLease(() => 'never-runs', {
            fsModule    : fsNever,
            owner       : 'summary',
            staleAfterMs: TEST_LEASE_STALE_MS
        })).rejects.toThrow(pathError);
    });

    test('#14205: buildLeasePayload requires staleAfterMs — the Neo/Base-free primitive fails loudly with no default', async () => {
        const leasePath = createLeasePath('staleAfterMs-required-guard');
        await expect(_rawAcquireHeavyMaintenanceLease({
            leasePath,
            owner: 'summary',
            now  : new Date('2026-05-16T20:00:00.000Z'),
            token: 'no-stale'
        })).rejects.toThrow(/staleAfterMs.*required/);
    });

    test('acquires and inspects a missing lease', async () => {
        const leasePath = createLeasePath('missing');
        const now       = new Date('2026-05-16T20:00:00.000Z');

        await expect(inspectHeavyMaintenanceLease({leasePath, now})).resolves.toMatchObject({
            status: 'missing',
            active: false,
            stale : false,
            lease : null
        });

        const result = await acquireHeavyMaintenanceLease({
            leasePath,
            owner       : 'kbSync',
            reason      : 'periodic-sync:1800000',
            metadata    : {taskName: 'kbSync'},
            pid         : process.pid,
            staleAfterMs: 60000,
            now,
            token       : 'owner-token'
        });

        expect(result).toMatchObject({
            status  : 'acquired',
            acquired: true,
            lease   : {
                owner       : 'kbSync',
                reason      : 'periodic-sync:1800000',
                pid         : process.pid,
                token       : 'owner-token',
                staleAfterMs: 60000,
                metadata    : {taskName: 'kbSync'}
            }
        });
        expect(result.lease.acquiredAt).toBe('2026-05-16T20:00:00.000Z');
        expect(result.lease.expiresAt).toBe('2026-05-16T20:01:00.000Z');

        await expect(inspectHeavyMaintenanceLease({leasePath, now})).resolves.toMatchObject({
            status: 'active',
            active: true,
            stale : false,
            lease : {
                owner: 'kbSync',
                token: 'owner-token'
            }
        });
    });

    test('shouldYieldHeavyMaintenanceLease bounds the active hold (#13780)', () => {
        const
            acquiredAt      = '2026-05-16T20:00:00.000Z',
            lease           = {owner: 'summary', acquiredAt},
            maxActiveHoldMs = 5 * 60 * 1000; // 5 min

        // active hold exceeds the budget → yield so an overdue peer can interleave
        expect(shouldYieldHeavyMaintenanceLease(lease, {
            now: new Date('2026-05-16T20:06:00.000Z'), maxActiveHoldMs
        })).toBe(true);

        // still within the budget → keep holding
        expect(shouldYieldHeavyMaintenanceLease(lease, {
            now: new Date('2026-05-16T20:03:00.000Z'), maxActiveHoldMs
        })).toBe(false);

        // exactly at the boundary → keep holding (strictly-greater contract)
        expect(shouldYieldHeavyMaintenanceLease(lease, {
            now: new Date('2026-05-16T20:05:00.000Z'), maxActiveHoldMs
        })).toBe(false);

        // unset / non-positive knob → never yields (byte-identical to today)
        expect(shouldYieldHeavyMaintenanceLease(lease, {now: new Date('2026-05-16T23:00:00.000Z')})).toBe(false);
        expect(shouldYieldHeavyMaintenanceLease(lease, {now: new Date('2026-05-16T23:00:00.000Z'), maxActiveHoldMs: 0})).toBe(false);

        // fail-safe: missing lease / missing acquiredAt / unparseable timestamp → do not abandon work
        expect(shouldYieldHeavyMaintenanceLease(null, {maxActiveHoldMs})).toBe(false);
        expect(shouldYieldHeavyMaintenanceLease({owner: 'summary'}, {maxActiveHoldMs})).toBe(false);
        expect(shouldYieldHeavyMaintenanceLease({acquiredAt: 'not-a-date'}, {
            now: new Date('2026-05-16T23:00:00.000Z'), maxActiveHoldMs
        })).toBe(false);
    });

    test('#14144: service.shouldYield() injects the reactive maxActiveHoldMs into the primitive', () => {
        const acquiredAt = '2026-05-16T20:00:00.000Z',
              lease      = {owner: 'summary', acquiredAt},
              service    = Neo.create(HeavyMaintenanceLeaseService, {});
        service.maxActiveHoldMs = 5 * 60 * 1000; // 5 min — through the reactive setter (config-default-independent)

        // hold past the reactive bound → yield (the service injects this.maxActiveHoldMs, no per-call arg)
        expect(service.shouldYield(lease, {now: new Date('2026-05-16T20:06:00.000Z')})).toBe(true);
        // still within the reactive bound → keep holding
        expect(service.shouldYield(lease, {now: new Date('2026-05-16T20:03:00.000Z')})).toBe(false);
        // explicit per-call override wins over the reactive default
        expect(service.shouldYield(lease, {now: new Date('2026-05-16T20:06:00.000Z'), maxActiveHoldMs: 30 * 60 * 1000})).toBe(false);
        // fail-safe: a falsy bound → never yields (byte-identical back-compat for the absent/0-leaf path)
        expect(service.shouldYield(lease, {now: new Date('2026-05-16T23:00:00.000Z'), maxActiveHoldMs: 0})).toBe(false)
    });

    test('process liveness detects invalid owner pids', () => {
        expect(isPidAlive(process.pid)).toBe(true);
        expect(isPidAlive(-1)).toBe(false);
        expect(isPidAlive('not-a-pid')).toBe(false);
    });

    test('#16210: a reused current PID cannot keep the previous process epoch lease alive', () => {
        const
            currentPid              = 1,
            currentProcessStartedAt = new Date('2026-07-31T04:00:00.000Z'),
            now                     = new Date('2026-07-31T04:02:00.000Z'),
            lease                   = {
                acquiredAt  : '2026-07-31T03:59:59.999Z',
                expiresAt   : '2026-07-31T10:00:00.000Z',
                pid         : currentPid,
                staleAfterMs: 6 * 60 * 60 * 1000
            },
            options                 = {
                currentPid,
                currentProcessStartedAt,
                isPidAlive: () => true,
                now
            };

        expect(isLeaseStale(lease, options)).toBe(true);
        expect(isLeaseStale({
            ...lease,
            acquiredAt: currentProcessStartedAt.toISOString()
        }, options)).toBe(false);
        expect(isLeaseStale({
            ...lease,
            acquiredAt: '2026-07-31T04:00:00.001Z'
        }, options)).toBe(false);
        expect(isLeaseStale({
            ...lease,
            pid: 2
        }, options)).toBe(false);
    });

    test('returns held status for active contention without throwing', async () => {
        const leasePath = createLeasePath('held');
        const now       = new Date('2026-05-16T20:00:00.000Z');

        await acquireHeavyMaintenanceLease({
            leasePath,
            owner       : 'summary',
            reason      : 'periodic-sweep:600000',
            now,
            staleAfterMs: 60000,
            token       : 'summary-token'
        });

        const result = await acquireHeavyMaintenanceLease({
            leasePath,
            owner       : 'kbSync',
            reason      : 'periodic-sync:1800000',
            now,
            staleAfterMs: 60000,
            token       : 'kb-token'
        });

        expect(result).toMatchObject({
            status  : 'held',
            acquired: false,
            lease   : {
                owner: 'summary',
                token: 'summary-token'
            }
        });
    });

    test('Sub 9 hypothesis 5: dead owner pid makes a wall-clock-active lease stale (#12617, #12264)', async () => {
        const leasePath = createLeasePath('dead-owner-pid');
        const now       = new Date('2026-05-16T20:00:00.000Z');

        await acquireHeavyMaintenanceLease({
            leasePath,
            owner       : 'kbSync',
            reason      : 'periodic-sync:1800000',
            pid         : 60789,
            staleAfterMs: 6 * 60 * 60 * 1000,
            now,
            token       : 'dead-owner-token'
        });

        await expect(inspectHeavyMaintenanceLease({
            leasePath,
            now,
            isPidAlive: () => false
        })).resolves.toMatchObject({
            status: 'stale',
            active: false,
            stale : true,
            lease : {
                owner: 'kbSync',
                pid  : 60789,
                token: 'dead-owner-token'
            }
        });

        await expect(acquireHeavyMaintenanceLease({
            leasePath,
            owner     : 'summary',
            now,
            token     : 'summary-token',
            isPidAlive: () => false
        })).resolves.toMatchObject({
            status        : 'acquired-after-stale',
            acquired      : true,
            previousStatus: 'stale',
            lease         : {
                owner: 'summary',
                token: 'summary-token'
            }
        });
    });

    test('concurrent acquisition converges to one owner', async () => {
        const leasePath = createLeasePath('concurrent');
        const now       = new Date('2026-05-16T20:00:00.000Z');

        const results = await Promise.all([
            acquireHeavyMaintenanceLease({leasePath, owner: 'summary', now, token: 'summary-token'}),
            acquireHeavyMaintenanceLease({leasePath, owner: 'kbSync', now, token: 'kb-token'})
        ]);

        expect(results.filter(result => result.acquired)).toHaveLength(1);
        expect(results.filter(result => result.status === 'held')).toHaveLength(1);

        const active = await inspectHeavyMaintenanceLease({leasePath, now});
        expect(['summary', 'kbSync']).toContain(active.lease.owner);
    });

    test('release is token guarded and idempotent for missing leases', async () => {
        const leasePath = createLeasePath('release');
        const now       = new Date('2026-05-16T20:00:00.000Z');

        await acquireHeavyMaintenanceLease({
            leasePath,
            owner: 'backup',
            now,
            token: 'backup-token'
        });

        await expect(releaseHeavyMaintenanceLease({
            leasePath,
            token: 'wrong-token',
            now
        })).resolves.toMatchObject({
            status  : 'not-owner',
            released: false,
            lease   : {owner: 'backup'}
        });

        await expect(inspectHeavyMaintenanceLease({leasePath, now})).resolves.toMatchObject({
            status: 'active',
            lease : {owner: 'backup'}
        });

        await expect(releaseHeavyMaintenanceLease({
            leasePath,
            token: 'backup-token',
            now
        })).resolves.toMatchObject({
            status  : 'released',
            released: true
        });

        await expect(releaseHeavyMaintenanceLease({
            leasePath,
            token: 'backup-token',
            now
        })).resolves.toMatchObject({
            status  : 'missing',
            released: false
        });
    });

    test('stale leases can be replaced deterministically', async () => {
        const leasePath = createLeasePath('stale');

        await acquireHeavyMaintenanceLease({
            leasePath,
            owner       : 'dream',
            now         : new Date('2026-05-16T20:00:00.000Z'),
            staleAfterMs: 1000,
            token       : 'dream-token'
        });

        expect(isLeaseStale(JSON.parse(await fs.readFile(leasePath, 'utf8')), {
            now: new Date('2026-05-16T20:00:01.000Z')
        })).toBe(true);

        const result = await acquireHeavyMaintenanceLease({
            leasePath,
            owner       : 'golden-path',
            now         : new Date('2026-05-16T20:00:01.000Z'),
            staleAfterMs: 1000,
            token       : 'golden-token'
        });

        expect(result).toMatchObject({
            status        : 'acquired-after-stale',
            acquired      : true,
            previousStatus: 'stale',
            lease         : {
                owner: 'golden-path',
                token: 'golden-token'
            }
        });
    });

    test('Sub 9 hypothesis 5: malformed leases recover at acquisition time (#12617)', async () => {
        const leasePath = createLeasePath('malformed');
        await fs.writeFile(leasePath, '{not-json', 'utf8');

        await expect(inspectHeavyMaintenanceLease({leasePath})).resolves.toMatchObject({
            status: 'malformed',
            active: false,
            stale : true
        });

        await expect(acquireHeavyMaintenanceLease({
            leasePath,
            owner: 'summary',
            token: 'summary-token'
        })).resolves.toMatchObject({
            status        : 'acquired-after-malformed',
            acquired      : true,
            previousStatus: 'malformed',
            lease         : {
                owner: 'summary',
                token: 'summary-token'
            }
        });
    });

    test('withLease releases after task completion and skips held tasks', async () => {
        const leasePath = createLeasePath('with-lease');
        const now       = new Date('2026-05-16T20:00:00.000Z');
        let   ran       = false;

        const completed = await withHeavyMaintenanceLease(() => {
            ran = true;
            return 'done';
        }, {
            leasePath,
            owner: 'summary',
            now,
            token: 'summary-token'
        });

        expect(completed).toMatchObject({
            status  : 'completed',
            acquired: true,
            result  : 'done'
        });
        expect(ran).toBe(true);
        await expect(inspectHeavyMaintenanceLease({leasePath, now})).resolves.toMatchObject({status: 'missing'});

        await acquireHeavyMaintenanceLease({
            leasePath,
            owner: 'kbSync',
            now,
            token: 'kb-token'
        });

        ran = false;
        const held = await withHeavyMaintenanceLease(() => {
            ran = true;
        }, {
            leasePath,
            owner: 'backup',
            now,
            token: 'backup-token'
        });

        expect(held).toMatchObject({
            status  : 'held',
            acquired: false,
            lease   : {owner: 'kbSync'}
        });
        expect(ran).toBe(false);
    });

    test('withLease release-timing invariant: task inner finally runs INSIDE the lease window (#11515)', async () => {
        // Empirical anchor: prior review cycles surfaced the same root failure-mode at two
        // different surfaces: substrate mutation placed AFTER `await withHeavyMaintenanceLease(...)`
        // runs OUTSIDE the lease window because the helper's own `finally` (release) fires before
        // the awaited promise settles.
        //
        // This test pins the structural ordering by capturing the lease-file presence at three
        // probe points:
        //   1. Inside the task body          (lease MUST exist)
        //   2. Inside the task's inner finally (lease MUST still exist — release hasn't fired yet)
        //   3. After `await withHeavyMaintenanceLease(...)` resolves (lease MUST be released)
        //
        // A future refactor that releases the lease before the task's inner finally runs would
        // fail probe 2 — exactly the consumer-side correctness invariant the JSDoc documents.
        const leasePath          = createLeasePath('release-timing');
        const now                = new Date('2026-05-16T20:00:00.000Z');
        const order              = [];
        let   leaseDuringBody    = null;
        let   leaseDuringFinally = null;
        let   leaseAfterAwait    = null;

        const completed = await withHeavyMaintenanceLease(async () => {
            order.push('task-body');
            leaseDuringBody = await inspectHeavyMaintenanceLease({leasePath, now});
            try {
                // Primary "heavy work" stand-in
                await Promise.resolve();
            } finally {
                // Substrate-protected side effect matching the canonical inner-finally pattern
                // from ai/scripts/runners/runSandman.mjs.
                order.push('task-finally');
                leaseDuringFinally = await inspectHeavyMaintenanceLease({leasePath, now});
            }
            return 'ok';
        }, {
            leasePath,
            owner: 'sandman',
            now,
            token: 'release-timing-token'
        });

        order.push('after-await');
        leaseAfterAwait = await inspectHeavyMaintenanceLease({leasePath, now});

        // Wrapper completed correctly.
        expect(completed).toMatchObject({
            status  : 'completed',
            acquired: true,
            result  : 'ok'
        });

        // Strict execution order: body → inner finally → post-await caller code.
        expect(order).toEqual(['task-body', 'task-finally', 'after-await']);

        // Probe 1: lease present during task body.
        expect(leaseDuringBody).toMatchObject({
            status: 'active',
            active: true,
            lease : {owner: 'sandman', token: 'release-timing-token'}
        });

        // Probe 2 — THE LOAD-BEARING ASSERTION:
        // Lease is STILL present during the task's inner finally. This is the contract the
        // canonical inner-finally pattern relies on for substrate-protected side effects.
        expect(leaseDuringFinally).toMatchObject({
            status: 'active',
            active: true,
            lease : {owner: 'sandman', token: 'release-timing-token'}
        });

        // Probe 3: lease released by the wrapper's own finally BEFORE the await settles.
        // Caller code post-await sees an empty lease file.
        expect(leaseAfterAwait).toMatchObject({
            status: 'missing',
            active: false,
            lease : null
        });
    });

    test('#11519 AC6: withHeavyMaintenanceLease returns inherited when env-token matches active lease', async () => {
        // Parent process acquires lease and exports its token via the inherited-token env-var.
        // Child process (simulated by setting process.env in this test) calls
        // withHeavyMaintenanceLease — expects 'inherited' status, task runs WITHOUT
        // acquire/release on the lease file. Empirical anchor: PrimaryRepoSyncService.runKbSync
        // cascade where parent primary-dev-sync holds the lease and the child kbSync
        // spawn would otherwise self-defer with 'held'.
        const leasePath = createLeasePath('cascade-inheritance');
        const now       = new Date('2026-05-16T20:00:00.000Z');

        const parent = await acquireHeavyMaintenanceLease({
            leasePath,
            owner       : 'primary-dev-sync',
            now,
            staleAfterMs: 60000,
            token       : 'parent-token'
        });

        const original = process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN;
        process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN = 'parent-token';

        let observedAcquisition = null;
        try {
            const result = await withHeavyMaintenanceLease(acquisition => {
                observedAcquisition = acquisition;
                return 'cascade-done';
            }, {
                leasePath,
                owner: 'kbSync',
                now,
                token: 'child-token'
            });

            expect(result).toMatchObject({
                status  : 'inherited',
                acquired: false,
                lease   : {owner: 'primary-dev-sync', token: 'parent-token'},
                result  : 'cascade-done'
            });
            expect(observedAcquisition).toMatchObject({
                status  : 'inherited',
                acquired: false,
                lease   : {owner: 'primary-dev-sync', token: 'parent-token'}
            });

            // Critical: lease file MUST still hold parent's lease — no release fired.
            await expect(inspectHeavyMaintenanceLease({leasePath, now})).resolves.toMatchObject({
                status: 'active',
                lease : {owner: 'primary-dev-sync', token: 'parent-token'}
            });
        } finally {
            if (original === undefined) {
                delete process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN;
            } else {
                process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN = original;
            }
            await releaseHeavyMaintenanceLease({leasePath, token: parent.lease.token, now});
        }
    });

    test('#16027: inherited-token matching follows a relocated orchestrator dataDir', async () => {
        const dataDir = path.join(
            process.cwd(),
            'tmp',
            `relocated-heavy-maintenance-${process.pid}-${Date.now()}-${Math.random()}`
        );
        const leasePath = resolveHeavyMaintenanceLeasePath({dataDir});
        const now       = new Date('2026-07-26T20:00:00.000Z');

        expect(leasePath).toBe(path.join(dataDir, 'heavy-maintenance-lease.json'));

        const parent = await acquireHeavyMaintenanceLease({
            leasePath,
            owner       : 'primary-dev-sync',
            now,
            staleAfterMs: TEST_LEASE_STALE_MS,
            token       : 'relocated-parent-token'
        });

        const original = process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN;
        process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN = parent.lease.token;

        try {
            const result = await withHeavyMaintenanceLease(() => 'relocated-child-ran', {
                leasePath,
                owner: 'kbSync',
                now,
                token: 'relocated-child-token'
            });

            expect(result).toMatchObject({
                status  : 'inherited',
                acquired: false,
                result  : 'relocated-child-ran',
                lease   : {
                    owner: 'primary-dev-sync',
                    token: 'relocated-parent-token'
                }
            });
            await expect(inspectHeavyMaintenanceLease({leasePath, now})).resolves.toMatchObject({
                status: 'active',
                lease : {token: 'relocated-parent-token'}
            });
        } finally {
            if (original === undefined) {
                delete process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN;
            } else {
                process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN = original;
            }
            try {
                await releaseHeavyMaintenanceLease({leasePath, token: parent.lease.token, now});
            } finally {
                await fs.remove(dataDir);
            }
        }
    });

    test('#11519 AC8a: env-token without active lease file falls through to normal acquire', async () => {
        // Env-var token set but lease file missing → inspectHeavyMaintenanceLease returns
        // status='missing' → no token to match → withHeavyMaintenanceLease falls through to
        // acquireHeavyMaintenanceLease normal path → acquires fresh lease.
        const leasePath = createLeasePath('inherit-missing');
        const now       = new Date('2026-05-16T20:00:00.000Z');

        const original = process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN;
        process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN = 'stale-parent-token';

        try {
            const result = await withHeavyMaintenanceLease(() => 'fresh-acquire', {
                leasePath,
                owner                : 'kbSync',
                now,
                staleAfterMs         : 60000,
                token                : 'child-token',
                onInheritedTokenStale: () => {} // AC8a hits the stale-inherited fall-through; pin no-op so the default warn does not leak into the suite
            });

            expect(result).toMatchObject({
                status  : 'completed',
                acquired: true,
                lease   : {owner: 'kbSync', token: 'child-token'},
                result  : 'fresh-acquire'
            });

            // Released by withHeavyMaintenanceLease's own finally.
            await expect(inspectHeavyMaintenanceLease({leasePath, now})).resolves.toMatchObject({
                status: 'missing'
            });
        } finally {
            if (original === undefined) {
                delete process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN;
            } else {
                process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN = original;
            }
        }
    });

    test('#11519 AC8b: env-token set but mismatching active lease falls through to normal acquire (defers as held)', async () => {
        // Env-var token set with token-X. Lease file exists with token-Y (different active owner).
        // Token mismatch → no inheritance → falls through to normal acquire path → returns 'held'
        // because token-Y owner is active. Prevents the bypass scenario where a stale env-var
        // would falsely inherit an unrelated active lease.
        const leasePath = createLeasePath('inherit-mismatch');
        const now       = new Date('2026-05-16T20:00:00.000Z');

        await acquireHeavyMaintenanceLease({
            leasePath,
            owner       : 'summary',
            now,
            staleAfterMs: 60000,
            token       : 'real-active-token'
        });

        const original = process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN;
        process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN = 'spurious-stale-token';

        let   taskRan        = false;
        const staleHookCalls = [];
        try {
            const result = await withHeavyMaintenanceLease(() => {
                taskRan = true;
            }, {
                leasePath,
                owner                : 'kbSync',
                now,
                token                : 'child-token',
                onInheritedTokenStale: info => staleHookCalls.push(info)
            });

            expect(result).toMatchObject({
                status  : 'held',
                acquired: false,
                lease   : {owner: 'summary', token: 'real-active-token'}
            });
            expect(taskRan).toBe(false);
            // Hardening: this is the exact silent-skip scenario (stale inherited token + lease held).
            // The deferral must be OBSERVABLE — a distinct previousStatus + the stale hook fired — so it
            // can never again masquerade as a "completed" multi-day stall.
            expect(result.previousStatus).toBe('inherited-token-stale');
            expect(staleHookCalls).toHaveLength(1);
            expect(staleHookCalls[0]).toMatchObject({inheritedToken: 'spurious-stale-token'});
        } finally {
            if (original === undefined) {
                delete process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN;
            } else {
                process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN = original;
            }
            await releaseHeavyMaintenanceLease({leasePath, token: 'real-active-token', now});
        }
    });

    test('#13763: stale-inherited-token deferral defaults to a loud stderr warn (no hook override)', async () => {
        // Same stale-inherited scenario as AC8b, but WITHOUT injecting onInheritedTokenStale — pins the
        // deliberately-loud DEFAULT (reconciled): with 6+ maintenance callers, a no-op default +
        // per-caller opt-in is the fragile discipline whose lapse caused the original silent-skip
        // regression, so the wrapper warns by default. The structural previousStatus marker stays present.
        const leasePath = createLeasePath('inherit-default-warn');
        const now       = new Date('2026-05-16T20:00:00.000Z');

        await acquireHeavyMaintenanceLease({
            leasePath,
            owner       : 'summary',
            now,
            staleAfterMs: 60000,
            token       : 'real-active-token'
        });

        const original = process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN;
        process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN = 'spurious-stale-token';

        const originalWarn = console.warn;
        const warnCalls    = [];
        console.warn = (...args) => warnCalls.push(args.join(' '));

        try {
            const result = await withHeavyMaintenanceLease(() => {}, {
                leasePath,
                owner: 'kbSync',
                now,
                token: 'child-token'
                // no onInheritedTokenStale → default loud warn
            });

            expect(result.previousStatus).toBe('inherited-token-stale');
            expect(warnCalls).toHaveLength(1);
            expect(warnCalls[0]).toContain('inherited lease token is stale');
        } finally {
            console.warn = originalWarn;
            if (original === undefined) {
                delete process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN;
            } else {
                process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN = original;
            }
            await releaseHeavyMaintenanceLease({leasePath, token: 'real-active-token', now});
        }
    });

    test('#11519 AC8c (also AC7 stale-cascade): env-token captured from stale-replaced parent falls through to defer', async () => {
        // Stale-cascade scenario:
        //   1. Parent acquires with token-X; spawns child with env-token=X
        //   2. Parent dies; TTL expires
        //   3. Another owner acquires (stale-replace) with token-Y
        //   4. Child executes withHeavyMaintenanceLease — sees env=X but file has token=Y
        //      → mismatch → falls through to normal acquire → returns 'held' (Y is active)
        // Verifies env-var inheritance does NOT bypass the lease invariant when the parent's
        // ownership has been mechanically transferred to a new owner via TTL stale-replacement.
        const leasePath = createLeasePath('inherit-stale-parent');
        const t0        = new Date('2026-05-16T20:00:00.000Z');
        const t1        = new Date('2026-05-16T20:00:30.000Z'); // after TTL of 1s

        await acquireHeavyMaintenanceLease({
            leasePath,
            owner       : 'primary-dev-sync',
            now         : t0,
            staleAfterMs: 1000,
            token       : 'orig-parent-token'
        });

        // Stale-replace by new owner
        const replace = await acquireHeavyMaintenanceLease({
            leasePath,
            owner       : 'summary',
            now         : t1,
            staleAfterMs: 60000,
            token       : 'new-owner-token'
        });

        expect(replace.status).toBe('acquired-after-stale');

        const original = process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN;
        process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN = 'orig-parent-token';

        let taskRan = false;
        try {
            const result = await withHeavyMaintenanceLease(() => {
                taskRan = true;
            }, {
                leasePath,
                owner                : 'kbSync',
                now                  : t1,
                token                : 'child-token',
                onInheritedTokenStale: () => {} // AC8c hits the stale-inherited fall-through; pin no-op so the default warn does not leak
            });

            expect(result).toMatchObject({
                status  : 'held',
                acquired: false,
                lease   : {owner: 'summary', token: 'new-owner-token'}
            });
            expect(taskRan).toBe(false);
        } finally {
            if (original === undefined) {
                delete process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN;
            } else {
                process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN = original;
            }
            await releaseHeavyMaintenanceLease({leasePath, token: 'new-owner-token', now: t1});
        }
    });

    test('#11519 AC1 substrate: sync overloads mirror async acquire/inspect/release semantics', () => {
        // Synchronous overloads exist exclusively to keep orchestrator-poll callers within
        // the synchronous poll cycle (per `Orchestrator.createMaintenanceExecutor`). Contract
        // mirrors async exactly — this test pins the shape so any drift between sync/async
        // payload, status names, or stale/malformed recovery semantics fails CI.
        const leasePath = createLeasePath('sync-overloads');
        const now       = new Date('2026-05-16T20:00:00.000Z');

        expect(inspectHeavyMaintenanceLeaseSync({leasePath, now})).toMatchObject({
            status: 'missing',
            active: false,
            lease : null
        });

        const acquired = acquireHeavyMaintenanceLeaseSync({
            leasePath,
            owner       : 'summary',
            now,
            staleAfterMs: 60000,
            token       : 'sync-token'
        });

        expect(acquired).toMatchObject({
            status  : 'acquired',
            acquired: true,
            lease   : {owner: 'summary', token: 'sync-token'}
        });

        expect(inspectHeavyMaintenanceLeaseSync({leasePath, now})).toMatchObject({
            status: 'active',
            active: true,
            lease : {owner: 'summary', token: 'sync-token'}
        });

        // Contention path mirrors async: 'held' without throwing
        const contended = acquireHeavyMaintenanceLeaseSync({
            leasePath,
            owner       : 'kbSync',
            now,
            staleAfterMs: 60000,
            token       : 'contender-token'
        });

        expect(contended).toMatchObject({
            status  : 'held',
            acquired: false,
            lease   : {owner: 'summary', token: 'sync-token'}
        });

        // Token-guarded release mirrors async
        expect(releaseHeavyMaintenanceLeaseSync({leasePath, token: 'wrong', now})).toMatchObject({
            status  : 'not-owner',
            released: false
        });

        expect(releaseHeavyMaintenanceLeaseSync({leasePath, token: 'sync-token', now})).toMatchObject({
            status  : 'released',
            released: true
        });

        expect(inspectHeavyMaintenanceLeaseSync({leasePath, now})).toMatchObject({
            status: 'missing'
        });
    });

    test('#12264: sync acquire replaces dead-owner leases for orchestrator poll callers', () => {
        const leasePath = createLeasePath('sync-dead-owner');
        const now       = new Date('2026-05-16T20:00:00.000Z');

        expect(acquireHeavyMaintenanceLeaseSync({
            leasePath,
            owner       : 'kbSync',
            pid         : 60789,
            now,
            staleAfterMs: 6 * 60 * 60 * 1000,
            token       : 'dead-owner-token'
        })).toMatchObject({
            status: 'acquired',
            lease : {owner: 'kbSync', pid: 60789}
        });

        expect(inspectHeavyMaintenanceLeaseSync({
            leasePath,
            now,
            isPidAlive: () => false
        })).toMatchObject({
            status: 'stale',
            stale : true,
            lease : {owner: 'kbSync', pid: 60789}
        });

        expect(acquireHeavyMaintenanceLeaseSync({
            leasePath,
            owner     : 'dream',
            now,
            token     : 'dream-token',
            isPidAlive: () => false
        })).toMatchObject({
            status        : 'acquired-after-stale',
            previousStatus: 'stale',
            lease         : {owner: 'dream', token: 'dream-token'}
        });
    });

    test('default singleton delegates to the reusable helpers', async () => {
        const leasePath = createLeasePath('service');
        const service   = Neo.create(HeavyMaintenanceLeaseService, {
            leasePath,
            staleAfterMs: 60000
        });

        const acquired = await service.acquire({
            owner: 'summary',
            token: 'service-token',
            now  : new Date('2026-05-16T20:00:00.000Z')
        });

        expect(acquired).toMatchObject({
            status: 'acquired',
            lease : {owner: 'summary', token: 'service-token'}
        });

        await expect(service.release({
            token: 'service-token',
            now  : new Date('2026-05-16T20:00:00.000Z')
        })).resolves.toMatchObject({status: 'released'});
    });

    test('#16027: service resolves AiConfig dataDir inside each operation without a second injection seam', async () => {
        const servicePath = path.resolve(
            process.cwd(),
            'ai/daemons/orchestrator/services/HeavyMaintenanceLeaseService.mjs'
        );
        const source      = await fs.readFile(servicePath, 'utf8');
        const methodMatch = source.match(
            /resolveLeasePath\(options = \{\}\) \{([\s\S]*?)\n {4}\}/
        );

        expect(methodMatch, 'resolveLeasePath method must remain present').not.toBeNull();
        expect(methodMatch[1]).toContain('dataDir  : AiConfig.orchestrator.dataDir');
        expect(methodMatch[1]).not.toContain('options.dataDir');
        expect(source).not.toMatch(
            /^(?:const|let|var)\s+\w*(?:lease|dataDir)\w*\s*=\s*AiConfig\.orchestrator\.dataDir/m
        );
    });

    test('stale takeover is identity-preserving — two reclaimers cannot both acquire (#15763)', async () => {
        const leasePath = createLeasePath('two-reclaimer-takeover');

        // Seed a genuinely stale lease (dead pid).
        await fs.writeJson(leasePath, buildLeasePayload({
            owner       : 'crashed-owner',
            staleAfterMs: TEST_LEASE_STALE_MS,
            pid         : 2147483647,
            token       : 'stale-token'
        }));

        // Contender B blocks at its guard entry (the atomic mkdir), which by
        // construction is AFTER B's stale inspection — the exact interleave where
        // an unguarded takeover let both contenders act on the same stale verdict.
        let bAtTakeover,
            releaseB;
        const bArrived = new Promise(resolve => bAtTakeover = resolve);
        const bGate    = new Promise(resolve => releaseB = resolve);
        const gatedFs  = {
            ...fs,
            async mkdir(...args) {
                bAtTakeover();
                await bGate;
                return fs.mkdir(...args);
            }
        };

        const contenderB = acquireHeavyMaintenanceLease({leasePath, owner: 'B', token: 'token-b', fsModule: gatedFs});

        await bArrived;

        // Contender A completes a full takeover while B is paused pre-rename.
        const resultA = await acquireHeavyMaintenanceLease({leasePath, owner: 'A', token: 'token-a'});
        expect(resultA).toMatchObject({acquired: true, status: 'acquired-after-stale'});

        releaseB();
        const resultB = await contenderB;

        // Exactly one acquirer; the live lease belongs to that winner.
        expect(resultB.acquired).toBe(false);
        expect(resultB.status).toBe('held');
        expect((await fs.readJson(leasePath)).token).toBe('token-a');
    });

    test('sync recovery defers to a lease replaced after the stale observation (#15763)', () => {
        const leasePath = createLeasePath('sync-replacement-after-observation');

        fs.writeJsonSync(leasePath, buildLeasePayload({
            owner       : 'crashed-owner',
            staleAfterMs: TEST_LEASE_STALE_MS,
            pid         : 2147483647,
            token       : 'stale-token'
        }));

        // Replacement-after-observation: between this contender's stale
        // inspection and its guard entry, another process replaces the lease
        // with a FRESH one. The guarded re-inspection must see the replacement
        // and defer — a recovery may only mutate state it re-observed INSIDE
        // the guard, never state from the earlier unguarded observation.
        let   swapped  = false;
        const racingFs = {
            ...fs,
            mkdirSync(...args) {
                if (!swapped) {
                    swapped = true;
                    fs.writeJsonSync(leasePath, buildLeasePayload({
                        owner       : 'fresh-owner',
                        staleAfterMs: TEST_LEASE_STALE_MS,
                        pid         : process.pid,
                        token       : 'fresh-token'
                    }));
                }
                return fs.mkdirSync(...args);
            }
        };

        const result = acquireHeavyMaintenanceLeaseSync({leasePath, owner: 'reclaimer', token: 'token-r', fsModule: racingFs});

        expect(result.acquired).toBe(false);
        expect(result.status).toBe('held');
        expect(fs.readJsonSync(leasePath).token).toBe('fresh-token');
    });

    test('async recovery defers to a lease replaced after the stale observation (#15763)', async () => {
        const leasePath = createLeasePath('async-replacement-after-observation');

        await fs.writeJson(leasePath, buildLeasePayload({
            owner       : 'crashed-owner',
            staleAfterMs: TEST_LEASE_STALE_MS,
            pid         : 2147483647,
            token       : 'stale-token'
        }));

        let   swapped  = false;
        const racingFs = {
            ...fs,
            async mkdir(...args) {
                if (!swapped) {
                    swapped = true;
                    await fs.writeJson(leasePath, buildLeasePayload({
                        owner       : 'fresh-owner',
                        staleAfterMs: TEST_LEASE_STALE_MS,
                        pid         : process.pid,
                        token       : 'fresh-token'
                    }));
                }
                return fs.mkdir(...args);
            }
        };

        const result = await acquireHeavyMaintenanceLease({leasePath, owner: 'reclaimer', token: 'token-r', fsModule: racingFs});

        expect(result.acquired).toBe(false);
        expect(result.status).toBe('held');
        expect((await fs.readJson(leasePath)).token).toBe('fresh-token');
    });

    test('release cannot remove a replacement owner installed after the release began (#15763)', async () => {
        const leasePath = createLeasePath('release-replacement');

        await fs.writeJson(leasePath, buildLeasePayload({
            owner       : 'old-owner',
            staleAfterMs: TEST_LEASE_STALE_MS,
            pid         : process.pid,
            token       : 'old-token'
        }));

        // Replacement-during-release: between the release call and its guarded
        // validation, a reclaimer replaces the lease (the TTL-expiry
        // interleave). Validation and removal execute inside one guarded
        // section, so the release observes the replacement and defers — an
        // unguarded check-then-remove deleted the replacement owner's lease.
        let   swapped  = false;
        const racingFs = {
            ...fs,
            async mkdir(...args) {
                if (!swapped) {
                    swapped = true;
                    await fs.writeJson(leasePath, buildLeasePayload({
                        owner       : 'replacement-owner',
                        staleAfterMs: TEST_LEASE_STALE_MS,
                        pid         : process.pid,
                        token       : 'replacement-token'
                    }));
                }
                return fs.mkdir(...args);
            }
        };

        const result = await releaseHeavyMaintenanceLease({leasePath, token: 'old-token', fsModule: racingFs});

        expect(result).toMatchObject({status: 'not-owner', released: false});
        expect((await fs.readJson(leasePath)).token).toBe('replacement-token');
    });

    test('sync release cannot remove a replacement owner installed after the release began (#15763)', () => {
        const leasePath = createLeasePath('sync-release-replacement');

        fs.writeJsonSync(leasePath, buildLeasePayload({
            owner       : 'old-owner',
            staleAfterMs: TEST_LEASE_STALE_MS,
            pid         : process.pid,
            token       : 'old-token'
        }));

        let   swapped  = false;
        const racingFs = {
            ...fs,
            mkdirSync(...args) {
                if (!swapped) {
                    swapped = true;
                    fs.writeJsonSync(leasePath, buildLeasePayload({
                        owner       : 'replacement-owner',
                        staleAfterMs: TEST_LEASE_STALE_MS,
                        pid         : process.pid,
                        token       : 'replacement-token'
                    }));
                }
                return fs.mkdirSync(...args);
            }
        };

        const result = releaseHeavyMaintenanceLeaseSync({leasePath, token: 'old-token', fsModule: racingFs});

        expect(result).toMatchObject({status: 'not-owner', released: false});
        expect(fs.readJsonSync(leasePath).token).toBe('replacement-token');
    });

    test('lifecycle guard serializes recovery against release — the outgoing owner cannot delete the reclaimer\'s lease (#15763)', async () => {
        const leasePath = createLeasePath('guard-serialization');

        await fs.writeJson(leasePath, buildLeasePayload({
            owner       : 'stale-owner',
            staleAfterMs: TEST_LEASE_STALE_MS,
            pid         : 2147483647,
            token       : 'stale-token'
        }));

        // Reclaimer R pauses INSIDE the guard (at its unlink), holding the
        // critical section. The stale lease's owner then calls release: an
        // unguarded release would read the still-present stale record, match
        // its own token, and remove whatever file exists when the remove()
        // lands — deleting R's fresh lease. Under the guard the release can
        // only run after R exits, observes R's lease, and defers.
        let rAtUnlink,
            releaseR;
        const rArrived = new Promise(resolve => rAtUnlink = resolve);
        const rGate    = new Promise(resolve => releaseR = resolve);
        const gatedFs  = {
            ...fs,
            async unlink(...args) {
                rAtUnlink();
                await rGate;
                return fs.unlink(...args);
            }
        };

        const reclaimer = acquireHeavyMaintenanceLease({leasePath, owner: 'R', token: 'token-r', fsModule: gatedFs});
        await rArrived;

        const releaseAttempt = releaseHeavyMaintenanceLease({leasePath, token: 'stale-token'});

        // Give the release a real window to run before R resumes; the guard
        // must hold it in its retry loop for this entire interval.
        await new Promise(resolve => setTimeout(resolve, 50));

        releaseR();

        const [reclaimResult, releaseResult] = await Promise.all([reclaimer, releaseAttempt]);

        expect(reclaimResult).toMatchObject({acquired: true, status: 'acquired-after-stale'});
        expect(releaseResult).toMatchObject({status: 'not-owner', released: false});
        expect((await fs.readJson(leasePath)).token).toBe('token-r');
    });

    test('an abandoned lifecycle guard is reclaimed after guardStaleAfterMs (#15763)', async () => {
        const leasePath = createLeasePath('abandoned-guard');
        const guardPath = `${leasePath}${LIFECYCLE_GUARD_SUFFIX}`;

        await fs.writeJson(leasePath, buildLeasePayload({
            owner       : 'crashed-owner',
            staleAfterMs: TEST_LEASE_STALE_MS,
            pid         : 2147483647,
            token       : 'stale-token'
        }));

        // A holder crashed inside the critical section: the guard directory
        // survives carrying its owner token with an old mtime and no live
        // owner behind it — the identity-safe steal path must consume it.
        const crashedOwnerFile = path.join(guardPath, 'owner-crashed');
        await fs.ensureDir(guardPath);
        await fs.writeFile(crashedOwnerFile, '', 'utf8');
        const past = new Date(Date.now() - 60_000);
        await fs.utimes(crashedOwnerFile, past, past);

        const result = await acquireHeavyMaintenanceLease({
            leasePath,
            owner            : 'recoverer',
            token            : 'token-r',
            guardStaleAfterMs: 1_000
        });

        expect(result).toMatchObject({acquired: true, status: 'acquired-after-stale'});
        expect(await fs.pathExists(guardPath)).toBe(false);
    });

    test('an interrupted-entry empty guard is recovered by atomic replacement (#15763)', async () => {
        const leasePath = createLeasePath('empty-guard');
        const guardPath = `${leasePath}${LIFECYCLE_GUARD_SUFFIX}`;

        await fs.writeJson(leasePath, buildLeasePayload({
            owner       : 'crashed-owner',
            staleAfterMs: TEST_LEASE_STALE_MS,
            pid         : 2147483647,
            token       : 'stale-token'
        }));

        // An EMPTY guard dir is never a live entrant under the owner-token
        // protocol (every real entry is born carrying its token via the staged
        // rename), so the atomic rename may replace it without waiting.
        await fs.ensureDir(guardPath);

        const result = await acquireHeavyMaintenanceLease({leasePath, owner: 'recoverer', token: 'token-r'});

        expect(result).toMatchObject({acquired: true, status: 'acquired-after-stale'});
        expect(await fs.pathExists(guardPath)).toBe(false);
    });

    test('a live contended lifecycle guard defers acquisition without mutating the lease (#15763)', async () => {
        const leasePath = createLeasePath('contended-guard');
        const guardPath = `${leasePath}${LIFECYCLE_GUARD_SUFFIX}`;

        await fs.writeJson(leasePath, buildLeasePayload({
            owner       : 'stale-owner',
            staleAfterMs: TEST_LEASE_STALE_MS,
            pid         : 2147483647,
            token       : 'stale-token'
        }));

        // A live guard carries its holder's FRESH owner token for the whole
        // retry budget: the contender can neither replace it (rename refuses a
        // non-empty target) nor steal it (fresh mtime) — it must exhaust its
        // attempts and defer, never mutating the (stale) lease underneath the
        // peer's transition.
        const liveOwnerFile = path.join(guardPath, 'owner-live-peer');
        await fs.ensureDir(guardPath);
        await fs.writeFile(liveOwnerFile, '', 'utf8');

        const result = await acquireHeavyMaintenanceLease({leasePath, owner: 'contender', token: 'token-c'});

        expect(result).toMatchObject({acquired: false, status: 'held', guardContended: true});
        expect((await fs.readJson(leasePath)).token).toBe('stale-token');
        expect(await fs.pathExists(liveOwnerFile)).toBe(true);

        await fs.remove(guardPath);
    });

    test('#16632: async release reports the contended guard path', async () => {
        const leasePath = createLeasePath('release-contention-async');
        const guardPath = `${leasePath}${LIFECYCLE_GUARD_SUFFIX}`;

        await withHeldLifecycleGuard(leasePath, async () => {
            await expect(releaseHeavyMaintenanceLease({
                leasePath,
                token            : 'release-token',
                guardStaleAfterMs: 60000,
                fsModule         : contentionFs
            })).rejects.toThrow(guardPath);
        });
    });

    test('#16632: async renewal reports the contended guard path', async () => {
        const leasePath = createLeasePath('renew-contention-async');
        const guardPath = `${leasePath}${LIFECYCLE_GUARD_SUFFIX}`;

        await withHeldLifecycleGuard(leasePath, async () => {
            await expect(renewHeavyMaintenanceLease({
                leasePath,
                token            : 'renew-token',
                staleAfterMs     : TEST_LEASE_STALE_MS,
                guardStaleAfterMs: 60000,
                fsModule         : contentionFs
            })).rejects.toThrow(guardPath);
        });
    });

    test('#16632: sync release reports the contended guard path', () => {
        const leasePath = createLeasePath('release-contention-sync');
        const guardPath = `${leasePath}${LIFECYCLE_GUARD_SUFFIX}`;

        withHeldLifecycleGuardSync(leasePath, () => {
            expect(() => releaseHeavyMaintenanceLeaseSync({
                leasePath,
                token            : 'release-token',
                guardStaleAfterMs: 60000,
                fsModule         : contentionFs
            })).toThrow(guardPath);
        });
    });

    test('#16632: sync renewal reports the contended guard path', () => {
        const leasePath = createLeasePath('renew-contention-sync');
        const guardPath = `${leasePath}${LIFECYCLE_GUARD_SUFFIX}`;

        withHeldLifecycleGuardSync(leasePath, () => {
            expect(() => renewHeavyMaintenanceLeaseSync({
                leasePath,
                token            : 'renew-token',
                staleAfterMs     : TEST_LEASE_STALE_MS,
                guardStaleAfterMs: 60000,
                fsModule         : contentionFs
            })).toThrow(guardPath);
        });
    });

    test('two contenders recovering one abandoned guard admit exactly one entrant (#15763)', async () => {
        const leasePath = createLeasePath('two-contender-abandoned-guard');
        const guardPath = `${leasePath}${LIFECYCLE_GUARD_SUFFIX}`;

        await fs.writeJson(leasePath, buildLeasePayload({
            owner       : 'crashed-owner',
            staleAfterMs: TEST_LEASE_STALE_MS,
            pid         : 2147483647,
            token       : 'stale-token'
        }));

        // The cycle-3 reviewer interleave: both contenders observe the SAME
        // abandoned guard; A consumes it, replaces it, and pauses inside its
        // critical section (at the lease unlink); B then attempts its steal
        // from the stale observation. Identity-safety requires B's steal to
        // abort — B's unlink targets the OBSERVED owner token, which A already
        // consumed (ENOENT), and A's replacement guard is non-empty for rmdir.
        // Under the pathname-based rmdir this exact schedule admitted both.
        // The crashed token is aged FAR past the threshold while both live
        // contenders use a threshold no in-test stall can reach — only the
        // abandoned artifact is ever legitimately stealable in this schedule.
        const crashedOwnerFile = path.join(guardPath, 'owner-crashed');
        await fs.ensureDir(guardPath);
        await fs.writeFile(crashedOwnerFile, '', 'utf8');
        const past = new Date(Date.now() - 300_000);
        await fs.utimes(crashedOwnerFile, past, past);

        // A pauses at its LEASE unlink (inside the guard, post-entry).
        let aAtLeaseUnlink,
            releaseA;
        const aArrived = new Promise(resolve => aAtLeaseUnlink = resolve);
        const aGate    = new Promise(resolve => releaseA = resolve);
        const fsForA   = {
            ...fs,
            async unlink(target, ...rest) {
                if (target === leasePath) {
                    aAtLeaseUnlink();
                    await aGate;
                }
                return fs.unlink(target, ...rest);
            }
        };

        // B pauses at its GUARD owner-token unlink (the steal step), AFTER its
        // stale observation — the exact reviewer schedule.
        let bAtOwnerUnlink,
            releaseB;
        const bArrived = new Promise(resolve => bAtOwnerUnlink = resolve);
        const bGate    = new Promise(resolve => releaseB = resolve);
        const fsForB   = {
            ...fs,
            async unlink(target, ...rest) {
                if (target === crashedOwnerFile) {
                    bAtOwnerUnlink();
                    await bGate;
                }
                return fs.unlink(target, ...rest);
            }
        };

        const contenderB = acquireHeavyMaintenanceLease({
            leasePath, owner: 'B', token: 'token-b', fsModule: fsForB, guardStaleAfterMs: 60_000
        });
        await bArrived; // B has observed the abandoned guard and sits pre-consumption

        const contenderA = acquireHeavyMaintenanceLease({
            leasePath, owner: 'A', token: 'token-a', fsModule: fsForA, guardStaleAfterMs: 60_000
        });
        await aArrived; // A consumed the abandoned guard, entered, and holds the section

        releaseB();     // B's steal now fires against A's replacement guard
        const resultB = await contenderB;

        releaseA();     // A completes its takeover
        const resultA = await contenderA;

        expect(resultA).toMatchObject({acquired: true, status: 'acquired-after-stale'});
        expect(resultB.acquired).toBe(false);
        expect(resultB.status).toBe('held');
        expect((await fs.readJson(leasePath)).token).toBe('token-a');
    });

    test('an evicted stalled holder defers instead of mutating the successor state (#15763)', async () => {
        const leasePath = createLeasePath('evicted-holder');
        const guardPath = `${leasePath}${LIFECYCLE_GUARD_SUFFIX}`;

        await fs.writeJson(leasePath, buildLeasePayload({
            owner       : 'crashed-owner',
            staleAfterMs: TEST_LEASE_STALE_MS,
            pid         : 2147483647,
            token       : 'stale-token'
        }));

        // Holder H enters and stalls inside its critical section long enough
        // to be judged abandoned; a successor legitimately evicts it and
        // completes a full takeover. H resumes AT its pre-mutation ownership
        // probe: the probe reads the post-eviction state, fails, and H defers —
        // without the probe H's unlink would delete the successor's fresh
        // lease. (A stall ending inside the probe→syscall gap itself is the
        // documented single-syscall residual, deliberately not modeled here.)
        let hAtProbe,
            releaseH,
            hPaused = false;
        const hArrived = new Promise(resolve => hAtProbe = resolve);
        const hGate    = new Promise(resolve => releaseH = resolve);
        const fsForH   = {
            ...fs,
            async stat(target, ...rest) {
                if (!hPaused && typeof target === 'string'
                    && target.startsWith(guardPath) && path.basename(target).startsWith('owner-')) {
                    hPaused = true;
                    hAtProbe();
                    await hGate;
                }
                return fs.stat(target, ...rest);
            }
        };

        const holder = acquireHeavyMaintenanceLease({
            leasePath, owner: 'H', token: 'token-h', fsModule: fsForH, guardStaleAfterMs: 200
        });
        await hArrived;

        // Age H's owner token past the threshold, then let a successor evict + take over.
        const [hOwnerName] = (await fs.readdir(guardPath)).filter(name => name.startsWith('owner-'));
        const past         = new Date(Date.now() - 60_000);
        await fs.utimes(path.join(guardPath, hOwnerName), past, past);

        const successor = await acquireHeavyMaintenanceLease({
            leasePath, owner: 'S', token: 'token-s', guardStaleAfterMs: 200
        });
        expect(successor).toMatchObject({acquired: true});

        releaseH();
        const resultH = await holder;

        expect(resultH.acquired).toBe(false);
        expect(resultH).toMatchObject({status: 'held', guardEvicted: true});
        expect((await fs.readJson(leasePath)).token).toBe('token-s');
    });

    test('sync steal aborts when the observed abandoned guard was replaced (#15763)', () => {
        const leasePath = createLeasePath('sync-identity-safe-steal');
        const guardPath = `${leasePath}${LIFECYCLE_GUARD_SUFFIX}`;

        fs.writeJsonSync(leasePath, buildLeasePayload({
            owner       : 'crashed-owner',
            staleAfterMs: TEST_LEASE_STALE_MS,
            pid         : 2147483647,
            token       : 'stale-token'
        }));

        const crashedOwnerFile = path.join(guardPath, 'owner-crashed');
        fs.ensureDirSync(guardPath);
        fs.writeFileSync(crashedOwnerFile, '', 'utf8');
        const past = new Date(Date.now() - 60_000);
        fs.utimesSync(crashedOwnerFile, past, past);

        // Between S's stale observation and its consumption step, a peer
        // completes the full recovery and now LIVES inside a replacement
        // guard. S's unlink of the observed token hits ENOENT and the steal
        // aborts; S must defer without touching the replacement.
        let   swapped      = false;
        const foreignOwner = path.join(guardPath, 'owner-foreign');
        const racingFs     = {
            ...fs,
            unlinkSync(target, ...rest) {
                if (!swapped && target === crashedOwnerFile) {
                    swapped = true;
                    fs.removeSync(guardPath);
                    fs.ensureDirSync(guardPath);
                    fs.writeFileSync(foreignOwner, '', 'utf8');
                }
                return fs.unlinkSync(target, ...rest);
            }
        };

        const result = acquireHeavyMaintenanceLeaseSync({
            leasePath, owner: 'S', token: 'token-s', fsModule: racingFs, guardStaleAfterMs: 60_000
        });

        expect(result.acquired).toBe(false);
        expect(result.status).toBe('held');
        expect(fs.pathExistsSync(foreignOwner)).toBe(true);
        expect(fs.readJsonSync(leasePath).token).toBe('stale-token');

        fs.removeSync(guardPath);
    });

    test('renewHeavyMaintenanceLease extends the owner deadline; non-owners cannot renew (#15763)', async () => {
        const leasePath = createLeasePath('renewal');
        const t0        = new Date('2026-07-24T08:00:00.000Z');

        await acquireHeavyMaintenanceLease({leasePath, owner: 'worker', token: 'owner-token', now: t0});

        const t1      = new Date(t0.getTime() + TEST_LEASE_STALE_MS - 1_000);
        const renewal = await renewHeavyMaintenanceLease({
            leasePath,
            token       : 'owner-token',
            staleAfterMs: TEST_LEASE_STALE_MS,
            now         : t1
        });

        expect(renewal).toMatchObject({status: 'renewed', renewed: true});
        expect(renewal.lease.token).toBe('owner-token');
        expect(renewal.lease.renewedAt).toBe(t1.toISOString());
        expect(renewal.lease.expiresAt).toBe(new Date(t1.getTime() + TEST_LEASE_STALE_MS).toISOString());

        // Past the ORIGINAL deadline the renewed lease still holds: live
        // expiry has been pushed forward, so no contender can reclaim.
        const t2        = new Date(t0.getTime() + TEST_LEASE_STALE_MS + 1_000);
        const contender = await acquireHeavyMaintenanceLease({leasePath, owner: 'contender', now: t2});
        expect(contender).toMatchObject({status: 'held', acquired: false});

        // Non-owner renewal defers and mutates nothing.
        const foreign = await renewHeavyMaintenanceLease({
            leasePath,
            token       : 'foreign-token',
            staleAfterMs: TEST_LEASE_STALE_MS,
            now         : t2
        });
        expect(foreign).toMatchObject({status: 'not-owner', renewed: false});
        expect((await fs.readJson(leasePath)).token).toBe('owner-token');

        await fs.remove(leasePath);
        await expect(renewHeavyMaintenanceLease({
            leasePath,
            token       : 'owner-token',
            staleAfterMs: TEST_LEASE_STALE_MS,
            now         : t2
        })).resolves.toMatchObject({status: 'missing', renewed: false});
    });

    test('sync renewal mirrors async renewal semantics (#15763)', () => {
        const leasePath = createLeasePath('renewal-sync');
        const t0        = new Date('2026-07-24T08:00:00.000Z');

        acquireHeavyMaintenanceLeaseSync({leasePath, owner: 'worker', token: 'owner-token', now: t0});

        const t1      = new Date(t0.getTime() + 30_000);
        const renewal = renewHeavyMaintenanceLeaseSync({
            leasePath,
            token       : 'owner-token',
            staleAfterMs: TEST_LEASE_STALE_MS,
            now         : t1
        });

        expect(renewal).toMatchObject({status: 'renewed', renewed: true});
        expect(renewal.lease.expiresAt).toBe(new Date(t1.getTime() + TEST_LEASE_STALE_MS).toISOString());

        expect(renewHeavyMaintenanceLeaseSync({
            leasePath,
            token       : 'foreign-token',
            staleAfterMs: TEST_LEASE_STALE_MS,
            now         : t1
        })).toMatchObject({status: 'not-owner', renewed: false});

        expect(() => renewHeavyMaintenanceLeaseSync({leasePath, token: 'owner-token', now: t1}))
            .toThrow(/staleAfterMs.*required/);
    });

    test('a live owner inside its TTL cannot be reclaimed; the boundary is the documented backstop (#15763)', async () => {
        const leasePath  = createLeasePath('live-owner-ttl-boundary');
        const acquiredAt = new Date('2026-07-23T12:00:00.000Z');

        await fs.writeJson(leasePath, buildLeasePayload({
            owner       : 'live-owner',
            staleAfterMs: TEST_LEASE_STALE_MS,
            pid         : process.pid,
            token       : 'live-token',
            now         : acquiredAt
        }));

        const justBefore = await acquireHeavyMaintenanceLease({
            leasePath,
            owner: 'contender',
            now  : new Date(acquiredAt.getTime() + TEST_LEASE_STALE_MS - 1)
        });
        expect(justBefore).toMatchObject({status: 'held', acquired: false});

        const atBoundary = await acquireHeavyMaintenanceLease({
            leasePath,
            owner: 'contender',
            now  : new Date(acquiredAt.getTime() + TEST_LEASE_STALE_MS)
        });
        expect(atBoundary).toMatchObject({acquired: true, status: 'acquired-after-stale'});
    });
});

/**
 * The cross-boot discriminator: a lease written by a DIFFERENT boot is stale regardless
 * of pid liveness — inside a container, pid 1 is vacuously alive on every boot (the init), so a
 * dead epoch's pid-1 lease would otherwise read live forever across a recreate. The gap-0 window
 * specimen is the generalized form: pre-stop wedged lease surviving the post-restart reclaim and
 * blocking the post-restoration backup until a manual rm.
 *
 * The discriminator is the payload's `bootId` — the container's hostname is its container ID,
 * which changes on recreate. Pre-`bootId` payloads skip the clause unchanged: absent evidence is
 * not a stale verdict, and no historical lease is condemned.
 */
test.describe('#16262 — bootId: cross-boot staleness regardless of pid liveness', () => {
    const baseOptions = {
        currentPid             : 7,
        currentProcessStartedAt: new Date('2026-08-01T12:03:00.000Z'),
        isPidAlive             : () => true, // the vacuous case: pid 1 is alive on every container boot
        now                    : new Date('2026-08-01T12:13:00.000Z'),
        currentBootId          : 'container-epoch-b'
    };

    test('a pid-1 lease from a DIFFERENT boot is stale even when the pid probe reports alive (the recreate specimen)', () => {
        const lease = {
            acquiredAt  : '2026-08-01T11:48:35.000Z',
            expiresAt   : '2026-08-01T18:00:00.000Z',
            pid         : 1,
            bootId      : 'container-epoch-a',
            staleAfterMs: 6 * 60 * 60 * 1000
        };

        expect(isLeaseStale(lease, baseOptions)).toBe(true);
    });

    test('a same-boot lease with a live holder is NOT staled by the clause (positive control)', () => {
        const lease = {
            acquiredAt  : '2026-08-01T12:10:00.000Z',
            expiresAt   : '2026-08-01T18:00:00.000Z',
            pid         : 1,
            bootId      : 'container-epoch-b',
            staleAfterMs: 6 * 60 * 60 * 1000
        };

        expect(isLeaseStale(lease, baseOptions)).toBe(false);
    });

    test('a pre-bootId payload classifies exactly as before — absent evidence is not a stale verdict', () => {
        const leaseWithoutBootId = {
            acquiredAt  : '2026-08-01T12:10:00.000Z',
            expiresAt   : '2026-08-01T18:00:00.000Z',
            pid         : 1,
            staleAfterMs: 6 * 60 * 60 * 1000
        };

        // Live holder, no bootId: the clause must not fire; the liveness path answers.
        expect(isLeaseStale(leaseWithoutBootId, baseOptions)).toBe(false);
        // …and a dead pid on the same shape still stales via the liveness probe.
        expect(isLeaseStale(leaseWithoutBootId, {...baseOptions, isPidAlive: () => false})).toBe(true);
    });

    test('buildLeasePayload emits bootId from os.hostname() by default and honors injection', async () => {
        const os = await import('node:os');

        const defaulted = buildLeasePayload({owner: 'kbSync', staleAfterMs: 1000});
        expect(defaulted.bootId).toBe(os.hostname());

        const injected = buildLeasePayload({owner: 'kbSync', staleAfterMs: 1000, bootId: 'injected-boot'});
        expect(injected.bootId).toBe('injected-boot');
    });
});
