import {test, expect}  from '@playwright/test';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

import {
    isDependencyBuild,
    resolvePackageBin,
    runPrepare
} from '../../../../buildScripts/util/prepare.mjs';

const
    __filename      = fileURLToPath(import.meta.url),
    repoRoot        = path.resolve(path.dirname(__filename), '../../../..'),
    resolveHuskyBin = root => resolvePackageBin('husky', 'husky', root);

/**
 * @summary The portable Engine prepare lifecycle: the lock-only guard short-circuits, then husky
 * and the skills materializer run in order, and either failure fails the install.
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

    test('a git-dependency build skips both stages: INIT_CWD names the consumer, not this checkout', () => {
        // npm builds a `github:` dependency in a cache clone and runs its `prepare` there, with
        // INIT_CWD pointing at the directory the consumer's install was invoked from. Husky and
        // the materializer provision THIS checkout; inside someone else's install they would write
        // hooks into a cache clone and a skills façade into the consumer's root.
        const {calls, spawnFn} = recordingSpawn([]),
              result           = runPrepare({env: {INIT_CWD: os.tmpdir()}, spawnFn});

        expect(result).toEqual({skipped: 'dependency-build', stage: 'guard', status: 0});
        expect(calls).toEqual([]);
    });

    test('the lock-only guard keeps precedence over the dependency-build guard', () => {
        const {calls, spawnFn} = recordingSpawn([]),
              result           = runPrepare({env: {INIT_CWD: os.tmpdir(), npm_config_package_lock_only: 'true'}, spawnFn});

        expect(result).toEqual({skipped: 'package-lock-only', stage: 'guard', status: 0});
        expect(calls).toEqual([]);
    });

    test('a checkout install runs both stages: INIT_CWD is this repo, literally or through a symlink', () => {
        const link = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-spec-')), 'checkout');

        fs.symlinkSync(repoRoot, link);

        try {
            for (const initCwd of [repoRoot, link]) {
                const {calls, spawnFn} = recordingSpawn([0, 0]),
                      result           = runPrepare({env: {INIT_CWD: initCwd}, spawnFn});

                expect(result).toEqual({skipped: null, stage: 'materialize', status: 0});
                expect(calls.length).toBe(2);
            }

            expect(isDependencyBuild({env: {}, root: repoRoot})).toBe(false);
            expect(isDependencyBuild({env: {INIT_CWD: link}, root: repoRoot})).toBe(false);
            expect(isDependencyBuild({env: {INIT_CWD: path.dirname(link)}, root: repoRoot})).toBe(true);
        } finally {
            fs.rmSync(path.dirname(link), {force: true, recursive: true})
        }
    });

    test('husky runs, then the skills materializer', () => {
        const {calls, spawnFn} = recordingSpawn([0, 0]),
              result           = runPrepare({env: {}, spawnFn});

        expect(result).toEqual({skipped: null, stage: 'materialize', status: 0});
        expect(calls.map(call => call.args[0])).toEqual([
            resolveHuskyBin(repoRoot),
            resolvePackageBin('neo-agent-skills', 'neo-agent-skills-materialize', repoRoot)
        ]);
    });

    test('a husky failure fails the install before the materializer runs', () => {
        const {calls, spawnFn} = recordingSpawn([1]),
              result           = runPrepare({env: {}, spawnFn});

        expect(result).toEqual({skipped: null, stage: 'husky', status: 1});
        expect(calls.length).toBe(1);
    });

    test('a materializer failure fails the install', () => {
        const {calls, spawnFn} = recordingSpawn([0, 1]),
              result           = runPrepare({env: {}, spawnFn});

        expect(result).toEqual({skipped: null, stage: 'materialize', status: 1});
        expect(calls.length).toBe(2);
    });

    test('a manifest without the named bin entry is a named error, even when it declares others', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-spec-'));

        fs.mkdirSync(path.join(dir, 'node_modules', 'neo-agent-skills'), {recursive: true});
        fs.writeFileSync(path.join(dir, 'node_modules', 'neo-agent-skills', 'package.json'), JSON.stringify({bin: {'neo-agent-skills-secrets': 'secrets.mjs'}}));

        try {
            expect(() => resolvePackageBin('neo-agent-skills', 'neo-agent-skills-materialize', dir)).toThrow(/declares no bin entry 'neo-agent-skills-materialize'/);
        } finally {
            fs.rmSync(dir, {force: true, recursive: true})
        }
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

    test('both entrypoints resolve from their packages\' own bin declarations on this host', () => {
        // The resolution is read from each manifest, not hardcoded — and both exist here.
        expect(fs.existsSync(resolveHuskyBin(repoRoot))).toBe(true);
        expect(fs.existsSync(resolvePackageBin('neo-agent-skills', 'neo-agent-skills-materialize', repoRoot))).toBe(true);
    });
});
