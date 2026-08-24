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
 * @summary Unit coverage for the heartbeat concurrency mutex helper.
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

    // Note: the former `swarm-heartbeat.sh defines the skip, stale-clear, and no-queue
    // semantics` test was removed with the bash script. The skip-vs-stale-clear
    // ordering is now covered against the JS lane in
    // `test/playwright/unit/ai/daemons/SwarmHeartbeatService.spec.mjs`.

    /**
     * The coordinate, not the mechanics.
     *
     * Every arm above passes an explicit `lockPath`, which is exactly why they were green while the
     * default was cwd-relative: a fixture that supplies the answer cannot observe where the answer
     * would otherwise come from. These arms assert the two properties that make the fork
     * impossible — no path bypasses the injection, and the injected coordinate is the same from any
     * working directory.
     */
    test.describe('#17660 — cwd-independent lock coordinate', () => {
        // The FALSIFYING half. A default that silently resolved somewhere is the whole defect, so
        // each entry point must refuse rather than pick. `fs.remove` on a bad path is destructive
        // and `fs.stat` on a missing one reports "no lock held" — the reading that starts the work
        // the mutex exists to prevent — so the throw has to land before either can run.
        test('every lock operation refuses a missing coordinate BEFORE touching the filesystem', async () => {
            const expected = /requires an injected lockPath/;

            await expect(lockModule.acquireHeartbeatLock()).rejects.toThrow(expected);
            await expect(lockModule.acquireHeartbeatLock({})).rejects.toThrow(expected);
            await expect(lockModule.releaseHeartbeatLock({})).rejects.toThrow(expected);
            await expect(lockModule.inspectHeartbeatLock({})).rejects.toThrow(expected);
            await expect(lockModule.withHeartbeatLock(async () => 'unreachable', {})).rejects.toThrow(expected);

            // Nothing was created on the way to any of those throws. `tmpBase` exists only once
            // `acquireHeartbeatLock` runs its `ensureDir`, so its absence IS the before-filesystem
            // assertion rather than a restatement of the throws above.
            expect(await fs.pathExists(tmpBase)).toBe(false);
        });

        // The NON-VACUITY half (AC-3): resolve the coordinate from two different working
        // directories and assert they agree. Pre-repair this arm is RED by construction — the
        // module's answer WAS `process.cwd()` joined with a relative literal, so two cwds gave two
        // locks and the mutex stopped being one. Child processes because cwd is per-process.
        test('the configured coordinate is identical from two different working directories', async () => {
            const {execFileSync} = await import('child_process'),
                  os             = (await import('os')).default,
                  repoRoot       = process.cwd(),
                  bootstrap      = [
                      `await import('file://${path.resolve(repoRoot, 'src/Neo.mjs')}');`,
                      `await import('file://${path.resolve(repoRoot, 'src/core/_export.mjs')}');`,
                      `const {default: AiConfig} = await import('file://${path.resolve(repoRoot, 'ai/config.mjs')}');`,
                      "const p = (await import('node:path')).default;",
                      'const raw = AiConfig.heartbeatConcurrencyLockPath;',
                      // The RESOLVED path is the assertion subject, not the raw string. A relative
                      // coordinate compares EQUAL across cwds — it is the same string in both
                      // processes — so comparing raw values would pass against the very defect this
                      // arm exists to catch. Resolving is what turns "same answer" into "same file".
                      'process.stdout.write(JSON.stringify({raw, resolved: p.resolve(raw)}));'
                  ].join(''),
                  runFrom        = cwd => JSON.parse(execFileSync('node', ['--input-type=module', '-e', bootstrap], {
                      cwd,
                      encoding: 'utf-8',
                      env     : {...process.env, NEO_UNIT_TEST_MODE: 'true'}
                  }).trim());

            const fromRepoRoot = runFrom(repoRoot),
                  fromTmp      = runFrom(os.tmpdir());

            expect(fromRepoRoot.resolved).toBe(fromTmp.resolved);
            expect(path.isAbsolute(fromRepoRoot.raw)).toBe(true);
        });
    });
});
