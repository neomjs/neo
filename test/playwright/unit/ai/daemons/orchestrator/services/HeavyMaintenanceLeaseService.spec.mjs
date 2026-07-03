import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import path           from 'path';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import {
    HeavyMaintenanceLeaseService,
    acquireHeavyMaintenanceLease as _rawAcquireHeavyMaintenanceLease,
    acquireHeavyMaintenanceLeaseSync as _rawAcquireHeavyMaintenanceLeaseSync,
    inspectHeavyMaintenanceLease,
    inspectHeavyMaintenanceLeaseSync,
    isPidAlive,
    isLeaseStale,
    releaseHeavyMaintenanceLease,
    releaseHeavyMaintenanceLeaseSync,
    shouldYieldHeavyMaintenanceLease,
    withHeavyMaintenanceLease as _rawWithHeavyMaintenanceLease
} from '../../../../../../../ai/daemons/orchestrator/services/HeavyMaintenanceLeaseService.mjs';

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

test.describe('Neo.ai.daemons.services.HeavyMaintenanceLeaseService (#11505)', () => {
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
        // fail-safe: a falsy bound → never yields (byte-identical back-compat; #14186's absent/0-leaf path)
        expect(service.shouldYield(lease, {now: new Date('2026-05-16T23:00:00.000Z'), maxActiveHoldMs: 0})).toBe(false)
    });

    test('process liveness detects invalid owner pids', () => {
        expect(isPidAlive(process.pid)).toBe(true);
        expect(isPidAlive(-1)).toBe(false);
        expect(isPidAlive('not-a-pid')).toBe(false);
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
            leasePath_   : leasePath,
            staleAfterMs_: 60000
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
});
