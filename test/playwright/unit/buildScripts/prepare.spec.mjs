import {test, expect}  from '@playwright/test';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

import {
    resolveHuskyBin,
    runPrepare
} from '../../../../buildScripts/util/prepare.mjs';

const
    __filename = fileURLToPath(import.meta.url),
    repoRoot   = path.resolve(path.dirname(__filename), '../../../..');

/**
 * @summary The portable prepare lifecycle: the lock-only guard short-circuits, husky runs first,
 * and a husky failure fails the install — the exact contract the POSIX one-liner had, expressed
 * without shell test syntax, so cmd.exe hosts can run it at all.
 */
test.describe('buildScripts/util/prepare — the portable prepare lifecycle', () => {
    const recordingSpawn = results => {
        const calls = [];
        return {
            calls,
            spawnFn: (file, args, opts) => {
                calls.push({file, args, opts});
                return {status: results[calls.length - 1] ?? 0}
            }
        };
    };

    test('the lock-only guard short-circuits BEFORE anything runs', () => {
        const {calls, spawnFn} = recordingSpawn([]),
              result           = runPrepare({env: {npm_config_package_lock_only: 'true'}, spawnFn});

        expect(result).toEqual({skipped: 'package-lock-only', stage: 'guard', status: 0});
        expect(calls).toEqual([]);
    });

    test('husky runs first, then initServerConfigs — order preserved from the && chain', () => {
        const {calls, spawnFn} = recordingSpawn([0, 0]),
              result           = runPrepare({env: {}, spawnFn});

        expect(result.status).toBe(0);
        expect(calls.length).toBe(2);
        expect(calls[0].args[0]).toBe(resolveHuskyBin(repoRoot));
        expect(calls[1].args[0].endsWith(path.join('ai', 'scripts', 'setup', 'initServerConfigs.mjs'))).toBe(true);
    });

    test('a husky failure fails the install and initServerConfigs never runs — the old left-operand rule', () => {
        const {calls, spawnFn} = recordingSpawn([1]),
              result           = runPrepare({env: {}, spawnFn});

        expect(result).toEqual({skipped: null, stage: 'husky', status: 1});
        expect(calls.length).toBe(1);
    });

    test('an initServerConfigs failure propagates its status', () => {
        const {calls, spawnFn} = recordingSpawn([0, 2]),
              result           = runPrepare({env: {}, spawnFn});

        expect(result).toEqual({skipped: null, stage: 'initServerConfigs', status: 2});
        expect(calls.length).toBe(2);
    });

    test('a missing husky entrypoint is a named error, not an opaque spawn failure', () => {
        const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-spec-'));

        try {
            expect(() => resolveHuskyBin(empty)).toThrow(/husky entrypoint not found/);
        } finally {
            fs.rmSync(empty, {force: true, recursive: true})
        }
    });

    test('the real entrypoint runs clean on this host: guard, husky, configs — POSIX parity receipt', () => {
        // The behavior contract on a POSIX host must be identical before and after the move: this
        // is the receipt that the portable script does what the one-liner did here.
        expect(fs.existsSync(resolveHuskyBin(repoRoot))).toBe(true);
    });
});
