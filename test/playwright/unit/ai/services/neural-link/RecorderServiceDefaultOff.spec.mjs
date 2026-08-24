import {test, expect} from '@playwright/test';
import {spawnSync}    from 'node:child_process';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

/**
 * @summary Proves the Neural Link action-logging gate is OFF by default, that a seat opens NO Memory
 * Core connection at boot, that the independent transaction archive/replay contract keeps working under
 * the disabled default — and that NO host-side database artifact is ever created.
 *
 * **The last guarantee is what changed and why this file was rewritten.** Its original subject was a
 * WRITE HANDLE on a shared host SQLite file: it asserted `RecorderService.db` at boot, counted
 * `openStore` calls to prove single-flight, and watched for the file appearing. The relocation removed
 * that store entirely, so those assertions no longer describe anything. The invariant that replaces them
 * is stronger and simpler: **the file must never exist at all**, whatever the gate says. A future change
 * that quietly restores a host-local store — the friendly-looking fix when Memory Core is unreachable —
 * re-creates the two realities this work removed, and this is the arm that catches it.
 *
 * Child processes rather than in-process asserts, for the reason that still holds: the gate is a config
 * leaf bound to `NEO_NL_ACTION_LOGGING` at module-load time, so a single process can only ever observe
 * one value — the sibling `RecorderService.spec.mjs` sets it `true` process-wide and cannot unset it.
 *
 * Every child injects the archive transport. Without it a child either hangs waiting on a live
 * connection (credential present) or dies on a missing environment variable — neither of which is the
 * gate's behaviour, and both of which measure the harness instead of the subject.
 */
test.describe('Neural Link action logging default', () => {
    const rootDir = path.resolve(import.meta.dirname, '../../../../../..');

    /**
     * Boots RecorderService in a fresh child process with the archive transport injected.
     * @param {Object}  [options={}]
     * @param {Object}  [options.extraEnv=null] Additional env for the child.
     * @param {Boolean} [options.exerciseArchive=false] Also drive a save + read-back.
     * @param {Boolean} [options.exerciseTelemetry=false] Also drive three logged actions.
     * @returns {Object} Observed child outcome.
     */
    function bootRecorder({extraEnv = null, exerciseArchive = false, exerciseTelemetry = false} = {}) {
        const
            dir         = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-nl-gate-')),
            dbPath      = path.join(dir, 'graph.sqlite'),
            logsDir       = path.join(dir, 'logs'),
            telemetryStep = exerciseTelemetry ? `
                RecorderService.log({session_id: 's', sequence_id: 'a_1', timestamp: 1,
                    tool: 'create_component', success: true,  duration_ms: 10, app_name: 'App'});
                RecorderService.log({session_id: 's', sequence_id: 'a_1', timestamp: 2,
                    tool: 'create_component', success: false, duration_ms: 5,  app_name: 'App'});
                RecorderService.log({session_id: 's', sequence_id: 'a_1', timestamp: 3,
                    tool: 'simulate_event',   success: true,  duration_ms: 7,  app_name: 'App'});
            ` : '',
            archiveStep = exerciseArchive ? `
                const archive = await RecorderService.saveTransactionArchive({
                    appSessionId: 'spec-session',
                    name        : 'spec-archive',
                    transaction : {
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
            ` : '',
            // Neo must be bootstrapped before any `src/core` module loads — `Compare.mjs` calls
            // `Neo.gatekeep` at module scope, so importing RecorderService bare throws
            // "Neo is not defined". Same ordering the sibling specs get from `setup.mjs`.
            script = `
                import Neo       from ${JSON.stringify(path.join(rootDir, 'src/Neo.mjs'))};
                import * as core from ${JSON.stringify(path.join(rootDir, 'src/core/_export.mjs'))};
                const config          = (await import(${JSON.stringify(path.join(rootDir, 'ai/mcp/server/neural-link/config.mjs'))})).default;
                const client          = await import(${JSON.stringify(path.join(rootDir, 'ai/services/neural-link/memoryCoreArchiveClient.mjs'))});
                const RecorderService = (await import(${JSON.stringify(path.join(rootDir, 'ai/services/neural-link/RecorderService.mjs'))})).default;

                // Counted BEFORE initAsync, so "no connection at boot" is measured rather than assumed.
                let calls = 0;
                const store = new Map();

                client.setArchiveTransport(async (operation, args) => {
                    calls++;
                    if (operation === 'save_nl_transaction') {
                        store.set('a1', {archiveId: 'a1', ops: args.transaction.ops, sourceTxId: args.transaction.txId});
                        return {saved: true, archiveId: 'a1', sourceTxId: args.transaction.txId, opCount: args.transaction.ops.length};
                    }
                    if (operation === 'get_nl_transaction') return store.get(args.archiveId) ?? null;
                    return {updated: true};
                });

                await RecorderService.initAsync();

                const out = {
                    callsAtBoot : calls,
                    resolvedPath: config.memoryCoreDbPath,
                    gateValue   : config.actionLoggingEnabled
                };
                ${archiveStep}
                ${telemetryStep}
                process.stdout.write(JSON.stringify(out));
            `,
            childEnv = {...process.env, NEO_MEMORY_DB_PATH: dbPath, NEO_NL_LOG_PATH: logsDir, ...(extraEnv || {})};

        // Deleted rather than set to undefined: spawnSync stringifies an `undefined` value to the literal
        // "undefined", which a boolean leaf reads as set-and-truthy — making the default-off case prove
        // the env instead of the default.
        if (!extraEnv || !('NEO_NL_ACTION_LOGGING' in extraEnv)) {
            delete childEnv.NEO_NL_ACTION_LOGGING;
        }

        // Drop the harness's test-mode markers so the child resolves the PRODUCTION path leaf, which is
        // what a real seat does. Inheriting them made every child resolve one shared file that a sibling
        // spec creates first, so the assertion measured suite order rather than the gate.
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

        const aggregatePath = path.join(logsDir, 'nl-action-aggregate.json');

        let aggregate = null;

        try { aggregate = JSON.parse(fs.readFileSync(aggregatePath, 'utf8')) } catch {}

        return {
            ...(parsed || {}),
            // Existence of the path the config ACTUALLY chose — the only file that can prove or disprove
            // that a seat left a host-side artifact behind.
            fileExists     : Boolean(parsed?.resolvedPath) && fs.existsSync(parsed.resolvedPath),
            aggregateExists: fs.existsSync(aggregatePath),
            aggregate,
            error          : parsed ? null : (result.stderr || '').split('\n').slice(-14).join('\n')
        }
    }

    test('unset: the gate is off, nothing connects at boot, and no host database is created', () => {
        const out = bootRecorder();

        expect(out.error).toBeNull();
        expect(out.gateValue).toBe(false);
        expect(out.callsAtBoot).toBe(0);
        expect(out.fileExists).toBe(false);
    });

    test('enabled: the gate flips, and STILL nothing connects at boot and no host database is created', () => {
        const out = bootRecorder({extraEnv: {NEO_NL_ACTION_LOGGING: 'true'}});

        expect(out.error).toBeNull();
        expect(out.gateValue).toBe(true);
        // The relocation's real gain: opting IN to telemetry no longer opens anything at boot. The old
        // implementation created a write handle and a file here.
        expect(out.callsAtBoot).toBe(0);
        expect(out.fileExists).toBe(false);
    });

    test('unset: the transaction archive contract STILL works while telemetry is off', () => {
        const out = bootRecorder({exerciseArchive: true});

        expect(out.error).toBeNull();
        expect(out.gateValue).toBe(false);
        // The independence an earlier change established and this relocation must not quietly alter:
        // the archive is reachable while the telemetry gate is off.
        expect(out.archiveSaved).toBe(true);
        expect(out.archiveReason).toBeNull();
        expect(out.readBackOps).toBe(1);
        expect(out.fileExists).toBe(false);
    });

    test('enabled: the seat keeps the per-tool aggregate genesis reads as its telemetry proof', () => {
        const out = bootRecorder({extraEnv: {NEO_NL_ACTION_LOGGING: 'true'}, exerciseTelemetry: true});

        expect(out.error).toBeNull();

        // The aggregate genesis used to get from `SELECT ... GROUP BY tool`, now produced by the seat
        // itself. Counts only — no targets, no sessions, no arguments — so it cannot become the parallel
        // record the relocation exists to remove.
        expect(out.aggregate).toEqual([
            {tool: 'create_component', count: 2, successCount: 1, durationMs: 15},
            {tool: 'simulate_event',   count: 1, successCount: 1, durationMs: 7}
        ]);

        // A failed action is counted but not counted as a success — the distinction the probe's receipt
        // reports, and the one a plain call-counter would lose.
        expect(out.aggregate[0].count).toBeGreaterThan(out.aggregate[0].successCount);

        // Still no host DATABASE: the aggregate is ephemeral accounting, not a relocated store.
        expect(out.fileExists).toBe(false);
    });

    test('unset: the aggregate is governed by the same gate and is never written', () => {
        // The arm that keeps the new artifact honest. `logPath` is configured in EVERY seat, so without
        // the gate this file would appear in normal operation — a host-side data artifact the relocation
        // is supposed to have removed. Three actions are driven here and must leave nothing behind.
        const out = bootRecorder({exerciseTelemetry: true});

        expect(out.error).toBeNull();
        expect(out.gateValue).toBe(false);
        expect(out.aggregateExists).toBe(false);

        // POSITIVE CONTROL: the same reader DOES find the file when the gate is on, so this zero is a
        // measurement of the gate rather than of a mistyped path.
        expect(bootRecorder({extraEnv: {NEO_NL_ACTION_LOGGING: 'true'}, exerciseTelemetry: true}).aggregateExists).toBe(true);
    });

    test('enabled: the transaction archive contract also works', () => {
        const out = bootRecorder({extraEnv: {NEO_NL_ACTION_LOGGING: 'true'}, exerciseArchive: true});

        expect(out.error).toBeNull();
        expect(out.archiveSaved).toBe(true);
        expect(out.readBackOps).toBe(1);
        expect(out.fileExists).toBe(false);
    });
});
