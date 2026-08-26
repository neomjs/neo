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
 * @summary The portable Engine prepare lifecycle: the lock-only guard short-circuits and a husky
 * failure fails the install without invoking Brain-owned setup.
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

    test('husky is the only Engine prepare step', () => {
        const {calls, spawnFn} = recordingSpawn([0]),
              result           = runPrepare({env: {}, spawnFn});

        expect(result).toEqual({skipped: null, stage: 'husky', status: 0});
        expect(calls.length).toBe(1);
        expect(calls[0].args[0]).toBe(resolveHuskyBin(repoRoot));
    });

    test('a husky failure fails the install', () => {
        const {calls, spawnFn} = recordingSpawn([1]),
              result           = runPrepare({env: {}, spawnFn});

        expect(result).toEqual({skipped: null, stage: 'husky', status: 1});
        expect(calls.length).toBe(1);
    });

    test('a missing husky entrypoint is a named error, not an opaque spawn failure', () => {
        const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-spec-'));

        try {
            expect(() => resolveHuskyBin(empty)).toThrow(/husky package not found/);
        } finally {
            fs.rmSync(empty, {force: true, recursive: true})
        }
    });

    test('a husky package declaring no bin entry is a named error', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-spec-'));

        fs.mkdirSync(path.join(dir, 'node_modules', 'husky'), {recursive: true});
        fs.writeFileSync(path.join(dir, 'node_modules', 'husky', 'package.json'), '{}');

        try {
            expect(() => resolveHuskyBin(dir)).toThrow(/declares no bin entry/);
        } finally {
            fs.rmSync(dir, {force: true, recursive: true})
        }
    });

    test('a corrupt husky manifest is a named parse error, matching its neighbours', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-spec-'));

        fs.mkdirSync(path.join(dir, 'node_modules', 'husky'), {recursive: true});
        fs.writeFileSync(path.join(dir, 'node_modules', 'husky', 'package.json'), '{not json');

        try {
            expect(() => resolveHuskyBin(dir)).toThrow(/cannot parse husky's package\.json/);
        } finally {
            fs.rmSync(dir, {force: true, recursive: true})
        }
    });

    test('a bin target missing from disk is a named error naming the entry', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-spec-'));

        fs.mkdirSync(path.join(dir, 'node_modules', 'husky'), {recursive: true});
        fs.writeFileSync(path.join(dir, 'node_modules', 'husky', 'package.json'), JSON.stringify({bin: {husky: 'bin.js'}}));

        try {
            expect(() => resolveHuskyBin(dir)).toThrow(/'bin\.js' not found/);
        } finally {
            fs.rmSync(dir, {force: true, recursive: true})
        }
    });

    test('a failure-to-launch throws with the error code — never a bare exit 1 with no diagnostic', () => {
        // spawnSync signals failure-to-launch through `error`, not `status`: reading only `status`
        // maps it to 1 with zero output, the same invisibility class this module exists to remove.
        const spawnFn = () => ({error: Object.assign(new Error('spawn node ENOENT'), {code: 'ENOENT'}), status: null});

        expect(() => runPrepare({env: {}, spawnFn})).toThrow(/failed to launch.*ENOENT/);
    });

    test('the husky entrypoint resolves from the package\'s own bin declaration on this host', () => {
        // The resolution is read from husky's manifest, not hardcoded — and it exists here.
        expect(fs.existsSync(resolveHuskyBin(repoRoot))).toBe(true);
    });
});
