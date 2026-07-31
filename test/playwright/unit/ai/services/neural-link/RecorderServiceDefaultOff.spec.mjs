import {test, expect} from '@playwright/test';
import {spawnSync}    from 'node:child_process';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

/**
 * @summary Proves the Neural Link action-logging gate is OFF by default and opens NO handle on the
 * plane graph at boot, that the explicit opt-in still works, and — critically — that the
 * independent transaction archive/replay contract keeps working under the disabled default.
 *
 * Child processes rather than in-process asserts, for two reasons. First, the gate is a config leaf
 * bound to `NEO_NL_ACTION_LOGGING` at module-load time, so a single process can only ever observe
 * one value — the sibling `RecorderService.spec.mjs` sets it to `true` process-wide and cannot
 * unset it. Second, the claims under test are about a real seat's behaviour: the defect the gate
 * guards was a WRITE HANDLE on a shared SQLite file, and the defect the archive tests guard was a
 * real `save_transaction` returning `archive-store-unavailable`. Asserting on config values, or
 * grepping source for the flag, would pass while both were broken.
 *
 * Each guarantee gets its own probe because they are no longer separable in one run: with a lazy
 * connection, exercising the archive legitimately opens the store, so "no artifact at boot" and
 * "archive works" cannot be asserted from the same child.
 */
test.describe('Neural Link action logging default', () => {
    const rootDir = path.resolve(import.meta.dirname, '../../../../../..');

    /**
     * Boots RecorderService in a fresh child process against a throwaway database path.
     * @param {Object}  [options={}]
     * @param {Object}  [options.extraEnv=null]        Additional env for the child
     * @param {Boolean} [options.exerciseArchive=false] Also drive a real save + read-back
     * @param {Boolean} [options.exerciseParallelBurst=false] Drive 8 CONCURRENT first-use saves
     * @returns {Object} Observed child outcome
     */
    function bootRecorder({extraEnv = null, exerciseArchive = false, exerciseParallelBurst = false} = {}) {
        const
            dir         = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-nl-gate-')),
            dbPath      = path.join(dir, 'graph.sqlite'),
            archiveStep = exerciseArchive ? `
                const archive = await RecorderService.saveTransactionArchive({
                    appSessionId: 'spec-session',
                    name        : 'spec-archive',
                    transaction : {
                        // txId is REQUIRED: it feeds source_tx_id, which is NOT NULL. Omitting it
                        // returned 'archive-save-failed' -- a fixture looser than the contract.
                        txId        : 'spec-tx',
                        status      : 'committed',
                        committedAt : 1234,
                        originWriter: {agentId: 'spec-agent', sessionId: 'spec-session'},
                        ops         : [{kind: 'set', value: 1}]
                    }
                });
                const readBack = archive.saved
                    ? await RecorderService.getTransactionArchive({archiveId: archive.archiveId})
                    : null;
                out.archiveSaved  = archive.saved;
                out.archiveReason = archive.reason ?? null;
                out.readBackOps   = readBack ? readBack.ops.length : null;
                out.openedAfter   = Boolean(RecorderService.db);
            ` : '',
            burstStep = exerciseParallelBurst ? `
                let opens = 0;
                const origOpen = RecorderService.openStore.bind(RecorderService);
                RecorderService.openStore = (...args) => { opens++; return origOpen(...args); };
                const mkSave = (i) => RecorderService.saveTransactionArchive({
                    appSessionId: 'spec-session',
                    name        : 'parallel-' + i,
                    transaction : {
                        txId        : 'spec-tx-' + i,
                        status      : 'committed',
                        committedAt : 1234,
                        originWriter: {agentId: 'spec-agent', sessionId: 'spec-session'},
                        ops         : [{kind: 'set', value: i}]
                    }
                });
                const results = await Promise.all(Array.from({length: 8}, (_, i) => mkSave(i)));
                out.parallelSaved   = results.filter(r => r.saved).length;
                out.parallelReasons = [...new Set(results.map(r => r.reason ?? null))];
                out.openCalls       = opens;
                out.openedAfter     = Boolean(RecorderService.db);
            ` : '',
            // Neo must be bootstrapped before any `src/core` module loads -- `Compare.mjs` calls
            // `Neo.gatekeep` at module scope, so importing RecorderService bare throws
            // "Neo is not defined". Same ordering the sibling specs get from `setup.mjs`.
            // The child reports the path the CONFIG resolved, not the path this test suggested,
            // because `memoryCoreDbPath` selects a test destination whenever the harness markers
            // are inherited -- asserting on the suggested path passed vacuously in both cases.
            script = `
                import Neo       from ${JSON.stringify(path.join(rootDir, 'src/Neo.mjs'))};
                import * as core from ${JSON.stringify(path.join(rootDir, 'src/core/_export.mjs'))};
                const config          = (await import(${JSON.stringify(path.join(rootDir, 'ai/mcp/server/neural-link/config.mjs'))})).default;
                const RecorderService = (await import(${JSON.stringify(path.join(rootDir, 'ai/services/neural-link/RecorderService.mjs'))})).default;
                await RecorderService.initAsync();
                const out = {
                    openedAtBoot: Boolean(RecorderService.db),
                    resolvedPath: config.memoryCoreDbPath,
                    gateValue   : config.actionLoggingEnabled
                };
                ${archiveStep}${burstStep}
                process.stdout.write(JSON.stringify(out));
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
            ...(parsed || {}),
            // Existence of the path the config ACTUALLY chose -- the only file that can prove or
            // disprove that a seat left an artifact behind.
            fileExists: Boolean(parsed?.resolvedPath) && fs.existsSync(parsed.resolvedPath),
            error     : parsed ? null : (result.stderr || '').split('\n').slice(-14).join('\n')
        }
    }

    test('unset: no connection and no database file at boot', () => {
        const outcome = bootRecorder();

        expect(outcome.error, `child failed instead of reporting:\n${outcome.error}`).toBeNull();
        expect(outcome.gateValue).toBe(false);
        expect(outcome.openedAtBoot).toBe(false);
        // Guard against a vacuous pass: if the config resolved no path at all, absence of a file
        // would prove nothing about the gate.
        expect(outcome.resolvedPath).toBeTruthy();
        expect(outcome.fileExists).toBe(false)
    });

    test('enabled: connection open and database created at boot', () => {
        const outcome = bootRecorder({extraEnv: {NEO_NL_ACTION_LOGGING: 'true'}});

        expect(outcome.error, `child failed instead of reporting:\n${outcome.error}`).toBeNull();
        expect(outcome.gateValue).toBe(true);
        expect(outcome.openedAtBoot).toBe(true);
        expect(outcome.resolvedPath).toBeTruthy();
        // Positive control for the test above: the same existence check on the same resolved path
        // must flip to true, so a false there cannot be an artifact of checking a dead path.
        expect(outcome.fileExists).toBe(true)
    });

    test('unset: the transaction archive contract STILL works, opening the store on demand', () => {
        const outcome = bootRecorder({exerciseArchive: true});

        expect(outcome.error, `child failed instead of reporting:\n${outcome.error}`).toBeNull();
        expect(outcome.gateValue).toBe(false);
        // Still nothing at boot -- the telemetry guarantee is unchanged.
        expect(outcome.openedAtBoot).toBe(false);
        // The regression this test exists for: a valid committed transaction returned
        // {saved:false, reason:'archive-store-unavailable'} when the gate sat above the connection.
        expect(outcome.archiveReason).toBeNull();
        expect(outcome.archiveSaved).toBe(true);
        // Round-tripped, not merely accepted -- a save that cannot be read back is not a contract.
        expect(outcome.readBackOps).toBe(1);
        // And the store was opened lazily by that call rather than at boot.
        expect(outcome.openedAfter).toBe(true)
    });

    test('enabled: the transaction archive contract also works', () => {
        const outcome = bootRecorder({extraEnv: {NEO_NL_ACTION_LOGGING: 'true'}, exerciseArchive: true});

        expect(outcome.error, `child failed instead of reporting:\n${outcome.error}`).toBeNull();
        expect(outcome.archiveSaved).toBe(true);
        expect(outcome.readBackOps).toBe(1)
    });

    test('unset: 8 parallel first-use saves share exactly ONE store open (single-flight)', () => {
        const outcome = bootRecorder({exerciseParallelBurst: true});

        expect(outcome.error, `child failed instead of reporting:\n${outcome.error}`).toBeNull();
        expect(outcome.gateValue).toBe(false);
        expect(outcome.openedAtBoot).toBe(false);
        // Every concurrent save lands, none refused -- reason asserted before saved so a
        // rejection can never impersonate the race under test.
        expect(outcome.parallelReasons).toEqual([null]);
        expect(outcome.parallelSaved).toBe(8);
        // The measured regression (review cycle 2): a bare check-then-open admitted one
        // connection PER CALLER -- 32 parallel ensureStore calls returned 32 distinct
        // connections against one shared file. Single-flight means exactly one real open.
        expect(outcome.openCalls).toBe(1);
        expect(outcome.openedAfter).toBe(true)
    });

    test('the genesis probe opts in, so its telemetry oracle keeps a source', () => {
        // Structural tripwire ONLY -- a source-text check carries no behavioural claim. The
        // behavioural chain lives elsewhere: genesisProbe.spec.mjs asserts the INVOKED
        // createProbeEnvironments() output carries NEO_NL_ACTION_LOGGING='true', and the
        // end-to-end non-empty-telemetry AC is annotated as a live residual on the gating
        // ticket. This line exists so a blanket removal of the opt-in cannot land silently
        // between those two.
        const source = fs.readFileSync(path.join(rootDir, 'ai/scripts/diagnostics/genesisProbe.mjs'), 'utf8');

        expect(source).toContain('NEO_NL_ACTION_LOGGING');
        // Bound to the same env block that redirects writes into the disposable root, so enabling
        // logging can never touch the canonical plane.
        expect(source).toContain('NEO_MEMORY_DB_PATH')
    });

    test('the steady-state runbook retires the checkout-plane writer census (#16210)', () => {
        // The old one-shot cutover moved checkout data after a process-name census. The Docker
        // steady state never moves that plane, so retaining the census would imply the dangerous
        // copy/move procedure still exists. Any future logical import needs its own reviewed,
        // quiesced-writer workflow rather than reviving this partial proxy.
        const runbook = fs.readFileSync(
            path.join(rootDir, 'ai/scripts/lifecycle/local-agent-os/README.md'), 'utf8'
        );

        expect(runbook).not.toContain('memory-core|knowledge-base|neural-link');
        expect(runbook).not.toContain('lsof .neo-ai-data');
        expect(runbook).toContain('separately reviewed procedure and a quiesced writer plane')
    })
});
