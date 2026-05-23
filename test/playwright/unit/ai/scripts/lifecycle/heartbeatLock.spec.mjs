import {setup} from '../../../../setup.mjs';

const appName = 'HeartbeatLockTest';

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

import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import path           from 'path';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * @summary Unit coverage for the heartbeat concurrency mutex helper (#10319).
 *
 * The fallback heartbeat consumes `.neo-ai-data/heartbeat-concurrency.lock` as a skip
 * barrier. These tests keep the producer side isolated in temporary directories so the
 * real shared heartbeat lock is never touched by Playwright.
 */
test.describe('ai/scripts/heartbeatLock', () => {
    let lockModule;
    let tmpBase;
    let lockPath;

    test.beforeAll(async () => {
        lockModule = await import('../../../../../../ai/scripts/lifecycle/heartbeatLock.mjs');
    });

    test.beforeEach(async () => {
        tmpBase  = path.resolve(process.cwd(), 'tmp', `heartbeat-lock-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        lockPath = path.join(tmpBase, '.neo-ai-data', 'heartbeat-concurrency.lock');
    });

    test.afterEach(async () => {
        if (tmpBase) {
            await fs.remove(tmpBase).catch(() => {});
        }
    });

    test('withHeartbeatLock creates the lock during work and removes it after success', async () => {
        const result = await lockModule.withHeartbeatLock(async () => {
            expect(await fs.pathExists(lockPath)).toBe(true);

            const payload = await fs.readJson(lockPath);
            expect(payload.pid).toBe(process.pid);
            expect(payload.reason).toBe('unit-success');

            return 'done'
        }, {
            lockPath,
            metadata: {
                reason: 'unit-success'
            }
        });

        expect(result).toBe('done');
        expect(await fs.pathExists(lockPath)).toBe(false);
    });

    test('withHeartbeatLock removes the lock after task failure', async () => {
        await expect(lockModule.withHeartbeatLock(async () => {
            expect(await fs.pathExists(lockPath)).toBe(true);
            throw new Error('boom')
        }, {lockPath})).rejects.toThrow('boom');

        expect(await fs.pathExists(lockPath)).toBe(false);
    });

    test('inspectHeartbeatLock distinguishes fresh, stale, and missing locks', async () => {
        expect(await lockModule.inspectHeartbeatLock({lockPath})).toEqual({
            active: false,
            stale : false,
            ageMs : null
        });

        await lockModule.acquireHeartbeatLock({lockPath});

        const fresh = await lockModule.inspectHeartbeatLock({
            lockPath,
            staleAfterMs: 1000,
            now: new Date()
        });

        expect(fresh.active).toBe(true);
        expect(fresh.stale).toBe(false);
        expect(fresh.ageMs).toBeGreaterThanOrEqual(0);

        const oldDate = new Date(Date.now() - 60_000);
        await fs.utimes(lockPath, oldDate, oldDate);

        const stale = await lockModule.inspectHeartbeatLock({
            lockPath,
            staleAfterMs: 1000,
            now: new Date()
        });

        expect(stale.active).toBe(false);
        expect(stale.stale).toBe(true);
        expect(stale.ageMs).toBeGreaterThanOrEqual(1000);
    });

    // Note (#11766): the former `swarm-heartbeat.sh defines the skip, stale-clear, and
    // no-queue semantics` test was removed with the bash script. The skip-vs-stale-clear
    // ordering is now covered against the JS lane in
    // `test/playwright/unit/ai/daemons/SwarmHeartbeatService.spec.mjs`.
});
