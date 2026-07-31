import {test, expect} from '@playwright/test';
import {spawnSync}    from 'node:child_process';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

/**
 * @summary Proves Neural Link action logging is OFF by default and opens NO handle on the plane
 * graph, and that the explicit opt-in still works.
 *
 * Child processes rather than in-process asserts, for two reasons. First, the gate is a config leaf
 * bound to `NEO_NL_ACTION_LOGGING` at module-load time, so a single process can only ever observe
 * one value — the sibling `RecorderService.spec.mjs` sets it to `true` process-wide and cannot
 * unset it. Second, the claim under test is about a real seat's behaviour at boot, and the defect
 * this guards was a WRITE HANDLE existing on a shared SQLite file. Asserting on a config value, or
 * grepping the source for the flag, would both pass while the handle was still opened — so each
 * case invokes `initAsync()` for real and reports whether a connection exists.
 */
test.describe('Neural Link action logging default', () => {
    const rootDir = path.resolve(import.meta.dirname, '../../../../../..');

    /**
     * Boots RecorderService in a fresh child process against a throwaway database path and reports
     * whether a connection was opened.
     * @param {Object|null} extraEnv Additional env for the child, or null for none
     * @returns {Object} `{opened, dbPath, fileExists, error}`
     */
    function bootRecorder(extraEnv) {
        const
            dir    = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-16207-')),
            dbPath = path.join(dir, 'graph.sqlite'),
            // Neo must be bootstrapped before any `src/core` module loads -- `Compare.mjs` calls
            // `Neo.gatekeep` at module scope, so importing RecorderService bare throws
            // "Neo is not defined". Same ordering the sibling specs get from `setup.mjs`.
            // The child reports the path the CONFIG resolved, not the path this test suggested.
            // Necessary because `memoryCoreDbPath` selects a test destination whenever
            // `UNIT_TEST_MODE` / `NEO_TEST_CONFIG_TEMPLATES` is inherited from the Playwright
            // worker, so asserting existence of the suggested path passed vacuously in BOTH cases
            // -- it proved only that an unused path stayed unused.
            script = `
                import Neo     from ${JSON.stringify(path.join(rootDir, 'src/Neo.mjs'))};
                import * as core from ${JSON.stringify(path.join(rootDir, 'src/core/_export.mjs'))};
                const config          = (await import(${JSON.stringify(path.join(rootDir, 'ai/mcp/server/neural-link/config.mjs'))})).default;
                const RecorderService = (await import(${JSON.stringify(path.join(rootDir, 'ai/services/neural-link/RecorderService.mjs'))})).default;
                await RecorderService.initAsync();
                process.stdout.write(JSON.stringify({
                    opened      : Boolean(RecorderService.db),
                    resolvedPath: config.memoryCoreDbPath,
                    gateValue   : config.actionLoggingEnabled
                }));
            `,
            childEnv = {...process.env, NEO_MEMORY_DB_PATH: dbPath, ...(extraEnv || {})};

        // Deleted rather than set to undefined: spawnSync stringifies an `undefined` value to the
        // literal "undefined", which a boolean leaf would read as a set-and-truthy env -- making
        // the default-off case prove the env instead of the default.
        if (!extraEnv || !('NEO_NL_ACTION_LOGGING' in extraEnv)) {
            delete childEnv.NEO_NL_ACTION_LOGGING;
        }

        // Drop the harness's test-mode markers so the child resolves the PRODUCTION path leaf --
        // i.e. the unique `NEO_MEMORY_DB_PATH` above -- which is what a real seat does. Inheriting
        // them made every child resolve the ONE shared `NEO_TELEMETRY_DB_PATH_TEST` file, which the
        // sibling spec creates first (it sorts earlier), so the default-off case saw a pre-existing
        // file authored by someone else and the assertion measured suite order, not the gate.
        delete childEnv.UNIT_TEST_MODE;
        delete childEnv.NEO_TEST_CONFIG_TEMPLATES;
        delete childEnv.NEO_TELEMETRY_DB_PATH_TEST;

        const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
                cwd     : rootDir,
                encoding: 'utf8',
                env     : childEnv
            });

        let parsed = null;

        try { parsed = JSON.parse(result.stdout.trim().split('\n').pop()) } catch {}

        return {
            opened      : parsed ? parsed.opened : null,
            gateValue   : parsed ? parsed.gateValue : null,
            resolvedPath: parsed ? parsed.resolvedPath : null,
            // Existence of the path the config ACTUALLY chose -- the only file that can prove or
            // disprove that a seat left an artifact behind.
            fileExists: Boolean(parsed?.resolvedPath) && fs.existsSync(parsed.resolvedPath),
            error     : parsed ? null : (result.stderr || '').split('\n').slice(-12).join('\n')
        }
    }

    test('opens NO connection and creates NO database file when unset', () => {
        const outcome = bootRecorder(null);

        expect(outcome.error, `child failed instead of reporting:\n${outcome.error}`).toBeNull();
        expect(outcome.gateValue).toBe(false);
        expect(outcome.opened).toBe(false);
        // Guard against a vacuous pass: if the config resolved no path at all, absence of a file
        // would prove nothing about the gate.
        expect(outcome.resolvedPath).toBeTruthy();
        expect(outcome.fileExists).toBe(false)
    });

    test('opens a connection and creates the database when explicitly enabled', () => {
        const outcome = bootRecorder({NEO_NL_ACTION_LOGGING: 'true'});

        expect(outcome.error, `child failed instead of reporting:\n${outcome.error}`).toBeNull();
        expect(outcome.gateValue).toBe(true);
        expect(outcome.opened).toBe(true);
        expect(outcome.resolvedPath).toBeTruthy();
        // The positive control for the test above: the same existence check on the same resolved
        // path must flip to true, so a false there cannot be an artifact of checking a dead path.
        expect(outcome.fileExists).toBe(true)
    });

    test('the genesis probe opts in, so its telemetry oracle keeps a source', () => {
        // Positive control for the two cases above: the default-off tests only prove a seat is
        // quiet. This one proves the ONE caller that genuinely needs the table still turns it on.
        // Without it, a blanket disable would leave the blind probe comparing against an empty
        // oracle -- passing every unit test while silently gutting an external commitment.
        const source = fs.readFileSync(path.join(rootDir, 'ai/scripts/diagnostics/genesisProbe.mjs'), 'utf8');

        expect(source).toContain('NEO_NL_ACTION_LOGGING');
        // Bound to the same env block that redirects writes into the disposable root, so enabling
        // logging can never touch the canonical plane.
        expect(source).toContain('NEO_MEMORY_DB_PATH')
    });

    test('the cutover writer census matches neural-link', () => {
        // The census that missed this: `neural-link` was absent from the alternation, so the probe
        // reported an empty census while two NL processes held write handles on the plane graph.
        const runbook = fs.readFileSync(
            path.join(rootDir, 'ai/scripts/lifecycle/local-agent-os/README.md'), 'utf8'
        );

        expect(runbook).toContain('memory-core|knowledge-base|neural-link');
        expect(runbook).not.toContain('(memory-core|knowledge-base)/mcp-server')
    })
});
