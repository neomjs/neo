import {test, expect}                          from '@playwright/test';
import Neo                                     from '../../../../../../../src/Neo.mjs';
import * as core                               from '../../../../../../../src/core/_export.mjs';
import {mkdtemp, rm, readFile, writeFile, access} from 'fs/promises';
import os                                      from 'os';
import path                                    from 'path';

import {withAppendLock, APPEND_LOCK_SUFFIX} from '../../../../../../../ai/services/memory-core/helpers/walAppendLock.mjs';

/**
 * walAppendLock — the per-append cross-process write-lock that lets a SHARED WAL dir serialize
 * concurrent `appendWalMemory` writers without interleaving multi-KB records. Falsifier coverage:
 *
 *   - acquire   — the lock is held during `fn` and released (iff still ours) after.
 *   - never-fail — `fn` ALWAYS runs and returns its result: locked, OR (on a bounded acquire-timeout
 *                  against a live holder) UNLOCKED. A contended/hung lock never blocks the turn-save.
 *   - stale     — a dead-pid holder, a TTL-exceeded live holder, or a corrupt lock is reclaimed.
 *   - release   — removes the lock only when it still records our pid (never clobbers a successor).
 *
 * Real temp dir + real fs (the lock IS atomic-write behavior); clock / sleep / liveness are injected
 * so contention + reclaim are deterministic without spawning real PIDs.
 */
test.describe('Neo.ai.services.memory-core.helpers.walAppendLock', () => {
    let dir, walPath;

    test.beforeEach(async () => {
        dir     = await mkdtemp(path.join(os.tmpdir(), 'neo-wal-append-lock-'));
        walPath = path.join(dir, 'wal-2026-06-19.jsonl');
    });

    test.afterEach(async () => {
        await rm(dir, {recursive: true, force: true});
    });

    const lockPath = () => `${walPath}${APPEND_LOCK_SUFFIX}`;
    const noSleep  = async () => {};

    test('acquires the lock, holds it during fn, and releases it after', async () => {
        let heldDuringFn = false;

        const {result, locked} = await withAppendLock(walPath, async () => {
            try { await access(lockPath()); heldDuringFn = true; } catch (e) {}
            return 'written';
        }, {pid: 4242, now: () => 1000, isAlive: () => false, sleep: noSleep});

        expect(locked).toBe(true);
        expect(heldDuringFn).toBe(true);
        expect(result).toBe('written');
        await expect(access(lockPath())).rejects.toThrow(); // released after fn
    });

    test('NEVER-FAIL: a live holder held throughout → falls through UNLOCKED, but fn still runs', async () => {
        // Pre-existing lock owned by a different, "alive" pid that never releases.
        await writeFile(lockPath(), JSON.stringify({pid: 9999, startedAt: 1000}), 'utf8');

        let clock   = 1000;
        const now   = () => clock;
        const sleep = async ms => { clock += ms; }; // each retry advances the clock past the deadline

        let ran = false;
        const {result, locked} = await withAppendLock(walPath, async () => { ran = true; return 'fallthrough-write'; }, {
            pid: 4242, now, sleep, isAlive: () => true, ttlMs: 1_000_000, acquireTimeoutMs: 50, retryIntervalMs: 15
        });

        expect(locked).toBe(false);                 // could not acquire (live holder, never stale)
        expect(ran).toBe(true);                     // but the durable write STILL happened — never-fail
        expect(result).toBe('fallthrough-write');
        // the live holder's lock is left untouched (we must never displace a live holder)
        expect(JSON.parse(await readFile(lockPath(), 'utf8')).pid).toBe(9999);
    });

    test('stale-reclaim: a DEAD-pid holder is reclaimed and the lock acquired', async () => {
        await writeFile(lockPath(), JSON.stringify({pid: 9999, startedAt: 1000}), 'utf8');

        const {locked, result} = await withAppendLock(walPath, async () => 'wrote', {
            pid: 4242, now: () => 2000, isAlive: () => false, sleep: noSleep, ttlMs: 1_000_000, acquireTimeoutMs: 5000
        });

        expect(locked).toBe(true);                          // reclaimed the dead holder + acquired
        expect(result).toBe('wrote');
        await expect(access(lockPath())).rejects.toThrow(); // released after
    });

    test('stale-reclaim: a TTL-exceeded live holder is reclaimed', async () => {
        await writeFile(lockPath(), JSON.stringify({pid: 9999, startedAt: 1000}), 'utf8');

        const {locked} = await withAppendLock(walPath, async () => 'x', {
            // alive, but held 5000ms (now 6000 − startedAt 1000) > ttl 2000 → hung → reclaim
            pid: 4242, now: () => 6000, isAlive: () => true, sleep: noSleep, ttlMs: 2000, acquireTimeoutMs: 5000
        });

        expect(locked).toBe(true);
    });

    test('stale-reclaim: a corrupt lock never wedges the never-fail write path', async () => {
        await writeFile(lockPath(), 'not-json{', 'utf8');

        const {locked, result} = await withAppendLock(walPath, async () => 'x', {
            pid: 4242, now: () => 1000, isAlive: () => true, sleep: noSleep, acquireTimeoutMs: 5000
        });

        expect(locked).toBe(true);   // an unparseable holder is reclaimable
        expect(result).toBe('x');
    });

    test('release removes the lock only when it still records our pid (no successor clobber)', async () => {
        const {locked} = await withAppendLock(walPath, async () => {
            // a successor reclaims + re-owns the lock DURING our fn
            await writeFile(lockPath(), JSON.stringify({pid: 7777, startedAt: 2000}), 'utf8');
            return 'x';
        }, {pid: 4242, now: () => 1000, isAlive: () => false, sleep: noSleep});

        expect(locked).toBe(true);
        // our release saw holder.pid 7777 ≠ our 4242 → did NOT unlink; the successor's lock survives
        expect(JSON.parse(await readFile(lockPath(), 'utf8')).pid).toBe(7777);
    });
});
