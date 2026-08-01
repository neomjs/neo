import {test, expect}                             from '@playwright/test';
import Neo                                        from '../../../../../../src/Neo.mjs';
import * as core                                  from '../../../../../../src/core/_export.mjs';
import {mkdtemp, rm, readFile, writeFile, access} from 'fs/promises';
import os                                         from 'os';
import path                                       from 'path';

import {
    acquireDrainLock,
    DrainLockHeldError,
    DRAIN_LOCK_FILENAME
} from '../../../../../../ai/daemons/embed/drainLock.mjs';

/**
 * Drain-lock primitive (`ai/daemons/embed/drainLock.mjs`) — falsifier coverage for the mechanically
 * enforced sole-drainer invariant:
 *
 *   AC1 refuse      — a second LIVE host claiming the same WAL dir throws a holder-naming
 *                     DrainLockHeldError and does NOT take over (holder descriptor unchanged).
 *   AC2 stale       — a dead holder's lock is reclaimed by the next host (daemon succession path).
 *   AC2 corrupt     — an unparseable lock never wedges the drain: it is reclaimed.
 *   AC2 boot epoch  — a previous container's PID-1 lock is reclaimed even though PID 1 is alive.
 *   AC2 legacy pid  — a pre-bootId equal-PID lock predating this process is reclaimed.
 *   AC3 release     — release removes the lock iff it is still ours, is idempotent, and a displaced
 *                     host's late release never clobbers a successor's lock.
 *
 * Real temp directory + real fs (the lock IS atomic-write behavior); only the process-liveness probe
 * is injected so live/dead holders are simulated deterministically without spawning real PIDs.
 */
test.describe('Neo.ai.daemons.embed.drainLock', () => {
    let dir;

    test.beforeEach(async () => {
        dir = await mkdtemp(path.join(os.tmpdir(), 'neo-drain-lock-'));
    });

    test.afterEach(async () => {
        await rm(dir, {recursive: true, force: true});
    });

    const lockPath  = () => path.join(dir, DRAIN_LOCK_FILENAME);
    const alive     = () => true;
    const dead      = () => false;
    const holderNow = async () => JSON.parse(await readFile(lockPath(), 'utf8'));

    test('acquire writes a holder descriptor and returns a release handle', async () => {
        const handle = acquireDrainLock({dir, owner: 'daemon', pid: 4242, isAlive: dead, now: () => 1000});

        expect(handle.owner).toBe('daemon');
        expect(handle.pid).toBe(4242);

        const holder = await holderNow();
        expect(holder).toMatchObject({pid: 4242, owner: 'daemon', bootId: os.hostname()});
        expect(holder.startedAt).toBe('1970-01-01T00:00:01.000Z');
    });

    test('AC1: a second LIVE host refuses and names the holder (no takeover)', async () => {
        acquireDrainLock({dir, owner: 'daemon', pid: 4242, isAlive: alive});

        let thrown;
        try {
            acquireDrainLock({dir, owner: 'in-process', pid: 7777, isAlive: alive});
        } catch (err) {
            thrown = err;
        }

        expect(thrown).toBeInstanceOf(DrainLockHeldError);
        expect(thrown.code).toBe('DRAIN_LOCK_HELD');
        expect(thrown.message).toContain('daemon pid 4242');     // the holder named
        expect(thrown.message).toContain('in-process pid 7777'); // the refusing requester named

        // Holder unchanged — the refusing host did NOT take over.
        expect((await holderNow()).pid).toBe(4242);
    });

    test('AC2: a stale lock (dead holder) is reclaimed by the next host (daemon succession)', async () => {
        acquireDrainLock({dir, owner: 'daemon', pid: 4242, isAlive: dead}); // prior daemon
        const handle = acquireDrainLock({dir, owner: 'daemon', pid: 9001, isAlive: dead}); // successor, prior pid dead

        expect(handle.pid).toBe(9001);

        const holder = await holderNow();
        expect(holder.pid).toBe(9001);
        expect(holder.owner).toBe('daemon');
    });

    test('AC2: a corrupt lock is reclaimed — a garbage file never wedges the drain', async () => {
        await writeFile(lockPath(), 'not-json{{{', 'utf8');

        // Even with isAlive=true, an unparseable holder has no probeable pid → reclaim is the only
        // non-wedging choice.
        const handle = acquireDrainLock({dir, owner: 'in-process', pid: 5555, isAlive: alive});

        expect(handle.pid).toBe(5555);
        expect((await holderNow()).pid).toBe(5555);
    });

    test('AC2: a previous container boot’s PID-1 lock is stale even though PID 1 is alive', async () => {
        acquireDrainLock({
            dir,
            owner  : 'in-process',
            pid    : 1,
            bootId : 'container-epoch-a',
            now    : () => 1000,
            isAlive: alive
        });

        const handle = acquireDrainLock({
            dir,
            owner                  : 'in-process',
            pid                    : 1,
            bootId                 : 'container-epoch-b',
            now                    : () => 3000,
            currentProcessStartedAt: 2000,
            isAlive                : alive
        });

        expect(handle.pid).toBe(1);
        expect(await holderNow()).toMatchObject({pid: 1, bootId: 'container-epoch-b'});
    });

    test('AC2: a legacy equal-PID lock predating this process is reclaimed', async () => {
        await writeFile(lockPath(), JSON.stringify({
            pid       : 1,
            owner     : 'in-process',
            ownerToken: 'previous-process-token',
            startedAt : '1970-01-01T00:00:01.000Z',
            lastPulse : '1970-01-01T00:00:01.000Z'
        }), 'utf8');

        const handle = acquireDrainLock({
            dir,
            owner                  : 'in-process',
            pid                    : 1,
            bootId                 : 'container-epoch-b',
            now                    : () => 3000,
            currentProcessStartedAt: 2000,
            isAlive                : alive
        });

        expect(handle.pid).toBe(1);
        expect(await holderNow()).toMatchObject({pid: 1, bootId: 'container-epoch-b'});
    });

    test('AC2: a legacy different live PID remains held — absent boot identity is not stale evidence', async () => {
        await writeFile(lockPath(), JSON.stringify({
            pid       : 4242,
            owner     : 'daemon',
            ownerToken: 'live-holder-token',
            startedAt : '1970-01-01T00:00:01.000Z',
            lastPulse : '1970-01-01T00:00:01.000Z'
        }), 'utf8');

        expect(() => acquireDrainLock({
            dir,
            owner                  : 'in-process',
            pid                    : 1,
            bootId                 : 'container-epoch-b',
            now                    : () => 3000,
            currentProcessStartedAt: 2000,
            isAlive                : alive
        })).toThrow(DrainLockHeldError);

        expect(await holderNow()).toMatchObject({pid: 4242, ownerToken: 'live-holder-token'});
    });

    test('AC2: equal numeric pids never self-deadlock — token identity governs, a dead probe still reclaims', async () => {
        acquireDrainLock({dir, owner: 'in-process', pid: 4242, isAlive: alive});

        // Equal numeric pid with the probe ALIVE: identity is the opaque owner token, never the
        // pid — cross-namespace holders collide numerically (a host and a container can both be
        // pid 4242), so this claimant is NOT "ours" and must refuse rather than "reclaim itself".
        expect(() => acquireDrainLock({dir, owner: 'in-process', pid: 4242, isAlive: alive}))
            .toThrow(DrainLockHeldError);

        // The genuine restart case: the old process is GONE (probe dead), so its leftover
        // reclaims regardless of the numeric pid.
        const handle = acquireDrainLock({dir, owner: 'in-process', pid: 4242, isAlive: dead});

        expect(handle.pid).toBe(4242);
        handle.release();
    });

    test('AC3: release removes the lock only when still ours, and is idempotent', async () => {
        const handle = acquireDrainLock({dir, owner: 'daemon', pid: 4242, isAlive: dead});

        handle.release();
        await expect(access(lockPath())).rejects.toThrow(); // file gone

        handle.release(); // idempotent — no throw, no resurrection
        await expect(access(lockPath())).rejects.toThrow();
    });

    test('AC3: a displaced host’s late release never clobbers a successor’s lock', async () => {
        const first  = acquireDrainLock({dir, owner: 'daemon', pid: 4242, isAlive: dead});
        const second = acquireDrainLock({dir, owner: 'daemon', pid: 9001, isAlive: dead}); // reclaims the stale lock

        // The displaced first host releasing late must NOT delete the successor's lock.
        first.release();

        expect((await holderNow()).pid).toBe(9001);
        second.release();
        await expect(access(lockPath())).rejects.toThrow();
    });
});
