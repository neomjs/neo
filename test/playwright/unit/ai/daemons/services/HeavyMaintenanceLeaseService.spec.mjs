import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import path           from 'path';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {
    HeavyMaintenanceLeaseService,
    acquireHeavyMaintenanceLease,
    inspectHeavyMaintenanceLease,
    isLeaseStale,
    releaseHeavyMaintenanceLease,
    withHeavyMaintenanceLease
} from '../../../../../../ai/daemons/services/HeavyMaintenanceLeaseService.mjs';

function createLeasePath(name) {
    const dir = path.join(process.cwd(), 'tmp', `heavy-maintenance-lease-${process.pid}-${Date.now()}-${Math.random()}`);
    fs.ensureDirSync(dir);
    return path.join(dir, `${name}.json`);
}

test.describe('Neo.ai.daemons.services.HeavyMaintenanceLeaseService (#11505)', () => {
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
            pid         : 1234,
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
                pid         : 1234,
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

    test('malformed leases recover at acquisition time', async () => {
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
        let ran = false;

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
        // Empirical anchor: PR #11509 cycles 1 + 2 surfaced the same root failure-mode at two
        // different surfaces — substrate mutation placed AFTER `await withHeavyMaintenanceLease(...)`
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
        const leasePath = createLeasePath('release-timing');
        const now       = new Date('2026-05-16T20:00:00.000Z');
        const order     = [];
        let leaseDuringBody    = null;
        let leaseDuringFinally = null;
        let leaseAfterAwait    = null;

        const completed = await withHeavyMaintenanceLease(async () => {
            order.push('task-body');
            leaseDuringBody = await inspectHeavyMaintenanceLease({leasePath, now});
            try {
                // Primary "heavy work" stand-in
                await Promise.resolve();
            } finally {
                // Substrate-protected side effect (canonical inner-finally pattern from
                // buildScripts/ai/runSandman.mjs post-PR #11509).
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

    test('default singleton delegates to the reusable helpers', async () => {
        const leasePath = createLeasePath('service');
        const service   = Neo.create(HeavyMaintenanceLeaseService, {
            leasePath_: leasePath,
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
