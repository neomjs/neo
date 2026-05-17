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
    withHeavyMaintenanceLease,
    ENV_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN
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

    test('withLease inherits lease when environment token matches active owner', async () => {
        const leasePath = createLeasePath('inherited');
        const now       = new Date('2026-05-16T20:00:00.000Z');
        const token     = 'inherited-token';

        await acquireHeavyMaintenanceLease({
            leasePath,
            owner: 'parent-process',
            now,
            token
        });

        process.env[ENV_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN] = token;

        try {
            let ran = false;
            const inherited = await withHeavyMaintenanceLease(() => {
                ran = true;
                return 'child-done';
            }, {
                leasePath,
                owner: 'child-process',
                now
            });

            expect(inherited).toMatchObject({
                status  : 'inherited',
                acquired: false,
                lease   : {owner: 'parent-process', token},
                result  : 'child-done'
            });
            expect(ran).toBe(true);

            await expect(inspectHeavyMaintenanceLease({leasePath, now})).resolves.toMatchObject({
                status: 'active',
                lease : {owner: 'parent-process', token}
            });
        } finally {
            delete process.env[ENV_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN];
        }
    });

    test('withLease falls through to normal acquisition for stale, missing, or mismatched inherited tokens', async () => {
        const leasePath = createLeasePath('inherited-negative');
        const now       = new Date('2026-05-16T20:00:00.000Z');

        process.env[ENV_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN] = 'stale-token';

        try {
            let acquired = await withHeavyMaintenanceLease(() => 'run-1', {
                leasePath,
                owner: 'child-1',
                now,
                token: 'child-1-token'
            });

            expect(acquired).toMatchObject({
                status  : 'completed',
                acquired: true,
                result  : 'run-1'
            });

            await acquireHeavyMaintenanceLease({
                leasePath,
                owner: 'other-owner',
                now,
                token: 'other-token'
            });

            let held = await withHeavyMaintenanceLease(() => 'run-2', {
                leasePath,
                owner: 'child-2',
                now,
                token: 'child-2-token'
            });

            expect(held).toMatchObject({
                status  : 'held',
                acquired: false,
                lease   : {owner: 'other-owner', token: 'other-token'}
            });

            await fs.remove(leasePath);
            await acquireHeavyMaintenanceLease({
                leasePath,
                owner       : 'stale-parent',
                now,
                staleAfterMs: 1000,
                token       : 'stale-token'
            });

            let staleAcquired = await withHeavyMaintenanceLease(() => 'run-3', {
                leasePath,
                owner       : 'child-3',
                now         : new Date('2026-05-16T20:00:01.000Z'),
                staleAfterMs: 1000,
                token       : 'child-3-token'
            });

            expect(staleAcquired).toMatchObject({
                status  : 'completed',
                acquired: true,
                result  : 'run-3'
            });
        } finally {
            delete process.env[ENV_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN];
        }
    });
});
