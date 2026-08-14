import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'OffHostSyncTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import Neo                                                                        from '../../../../../../src/Neo.mjs';
import * as core                                                                  from '../../../../../../src/core/_export.mjs';
import {test, expect}                                                             from '@playwright/test';
import {mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync} from 'node:fs';
import {open, rename}                                                             from 'node:fs/promises';
import {spawn}                                                                    from 'node:child_process';
import {tmpdir}                                                                   from 'node:os';
import path                                                                       from 'node:path';

import {
    buildBackupReceipt,
    buildSyncChildEnv,
    redactAndBound,
    runOffHostSync,
    validateOffHostSyncConfig,
    writeBackupReceipt
} from '../../../../../../ai/scripts/maintenance/offHostSync.mjs';
import {
    __private__,
    OFFHOST_SYNC_ERROR_CODE,
    readBackupReceipt
} from '../../../../../../ai/services/memory-core/helpers/offHostSyncStore.mjs';

const VALID_CONFIG = {
    argv        : ['-e', 'process.exit(0)'],
    command     : process.execPath,
    envAllowlist: [],
    killGraceMs : 200,
    timeoutMs   : 1000
};

const makeTmp = () => mkdtempSync(path.join(tmpdir(), 'neo-offhost-'));

test.describe('offHostSync config validation (ticket-owned contract)', () => {
    test('empty command is disabled, not an error', () => {
        // `errorCode` is declared here because this exact-shape assertion IS the contract: a field
        // added to the outcome has to be named or the addition goes unwitnessed. Disabled-but-valid
        // carries a null code, so the field discriminates a defect rather than merely existing.
        expect(validateOffHostSyncConfig({command: ''})).toEqual({enabled: false, error: null, errorCode: null, value: null});
        expect(validateOffHostSyncConfig(undefined)).toEqual({enabled: false, error: null, errorCode: null, value: null});
    });

    test('every validation failure carries a stable code that never quotes the offending value', () => {
        // The code is what a remotely readable surface may carry; the prose is not, because the
        // placeholder and NUL branches interpolate the token and an operator can put a credential in
        // `argv`. Asserted as a set so the codes are DISTINCT rather than one constant reused.
        const secret = 'ghp_LEAK_CANARY',
              cases  = [
                  [null,                                            'CONFIG_NOT_OBJECT'],
                  [{command: 42},                                   'COMMAND_NOT_STRING'],
                  [{command: 'aws', argv: 7},                       'ARGV_NOT_STRING_ARRAY'],
                  [{command: `aws\0${secret}`},                     'NUL_BYTE'],
                  [{command: 'aws', argv: [`--pw=${secret}{bad}`]}, 'ARGV_PLACEHOLDER_INVALID'],
                  [{command: 'aws', envAllowlist: ['lower']},       'ENV_ALLOWLIST_INVALID'],
                  [{command: 'aws', timeoutMs: 1},                  'TIMEOUT_OUT_OF_RANGE'],
                  [{command: 'aws', killGraceMs: -1},               'KILL_GRACE_OUT_OF_RANGE']
              ];

        const observed = cases.map(([config, expected]) => {
            const outcome = validateOffHostSyncConfig(config);

            expect(outcome.enabled).toBe(false);
            expect(outcome.errorCode).toBe(OFFHOST_SYNC_ERROR_CODE[expected]);
            // The CODE is safe to project even when the prose is not.
            expect(outcome.errorCode).not.toContain(secret);
            expect(outcome.errorCode).toMatch(/^KB_OFFHOST_SYNC_[A-Z_]+$/u);

            return outcome.errorCode
        });

        expect(new Set(observed).size).toBe(cases.length);
    });

    test('a disabled hook with malformed keys is a validation failure, not a silent pass', () => {
        expect(validateOffHostSyncConfig({command: '', timeoutMs: 50}).enabled).toBe(false);
        expect(validateOffHostSyncConfig({command: '', envAllowlist: ['bad-name']}).enabled).toBe(false);
        expect(validateOffHostSyncConfig({command: '', argv: ['{partial}']}).enabled).toBe(false);
    });

    test('a valid config passes and normalizes', () => {
        const result = validateOffHostSyncConfig(VALID_CONFIG);
        expect(result.enabled).toBe(true);
        expect(result.error).toBe(null);
        expect(result.value.command).toBe(process.execPath);
    });

    test('partial or unknown placeholders fail validation', () => {
        for (const argv of [['sync-{bundleDir}'], ['{unknown}'], ['{bundleDir}/{bundleName}']]) {
            const result = validateOffHostSyncConfig({...VALID_CONFIG, argv});
            expect(result.enabled).toBe(false);
            expect(result.error).toContain('whole-token placeholder');
        }
    });

    test('whole-token placeholders pass', () => {
        const result = validateOffHostSyncConfig({...VALID_CONFIG, argv: ['{bundleDir}', '{bundleName}']});
        expect(result.enabled).toBe(true);
    });

    test('bad env names fail validation', () => {
        for (const envAllowlist of [['lowercase'], ['HAS-DASH'], [''], [123]]) {
            expect(validateOffHostSyncConfig({...VALID_CONFIG, envAllowlist}).enabled).toBe(false);
        }
    });

    test('timeoutMs and killGraceMs bounds are enforced', () => {
        expect(validateOffHostSyncConfig({...VALID_CONFIG, timeoutMs: 500}).enabled).toBe(false);
        expect(validateOffHostSyncConfig({...VALID_CONFIG, timeoutMs: 99999999}).enabled).toBe(false);
        expect(validateOffHostSyncConfig({...VALID_CONFIG, killGraceMs: -1}).enabled).toBe(false);
        expect(validateOffHostSyncConfig({...VALID_CONFIG, killGraceMs: 99999}).enabled).toBe(false);
    });
});

test.describe('sync child environment boundary', () => {
    test('only base names + allowlisted set names reach the child', () => {
        const env = buildSyncChildEnv(['AWS_TOKEN', 'UNSET_NAME'], {
            PATH               : '/usr/bin',
            HOME               : '/home/x',
            USER               : 'x',
            TMPDIR             : '/tmp',
            AWS_TOKEN          : 'secret-value',
            ORCHESTRATOR_SECRET: 'must-not-leak'
        });

        expect(env.AWS_TOKEN).toBe('secret-value');
        expect(env.UNSET_NAME).toBeUndefined();
        expect(env.ORCHESTRATOR_SECRET).toBeUndefined();
        expect(Object.keys(env).sort()).toEqual(['AWS_TOKEN', 'HOME', 'PATH', 'TMPDIR', 'USER'].sort());
    });

    test('redaction replaces allowlisted values before bounding', () => {
        const secret = 'ghp_1234567890abcdef';
        const out    = redactAndBound(`fatal: auth failed for ${secret} on host`, {AWS_TOKEN: secret});
        expect(out).not.toContain(secret);
        expect(out).toContain('***');
    });

    test('short allowlisted credentials redact regardless of length; base-env values are not mangled', () => {
        const out = redactAndBound(
            'fatal: auth failed for abc while writing /tmp/bundle',
            {PATH: '/usr/bin', HOME: '/h', USER: 'x', TMPDIR: '/tmp', AWS_TOKEN: 'abc'},
            undefined,
            ['AWS_TOKEN']
        );
        expect(out).not.toContain('abc');           // the short credential is gone
        expect(out).toContain('***');
        expect(out).toContain('/tmp/bundle');       // short base-env values are NOT mangled
        expect(out).toContain('writing');           // ordinary text survives
    });

    test('null/object/number argv returns a validation outcome, never a thrown TypeError', () => {
        for (const argv of [null, 42, {0: '-a'}]) {
            const result = validateOffHostSyncConfig({...VALID_CONFIG, argv});
            expect(result.enabled).toBe(false);
            expect(result.error).toContain('array of strings');
        }
    });

    test('non-object and NUL-bearing configs fail before launch', () => {
        expect(validateOffHostSyncConfig(null).enabled).toBe(false);
        expect(validateOffHostSyncConfig([]).enabled).toBe(false);
        expect(validateOffHostSyncConfig({command: 'rsync\0evil'}).enabled).toBe(false);
        expect(validateOffHostSyncConfig({command: 'rsync', argv: ['-a\0b']}).enabled).toBe(false);
    });

    test('bounding caps at 4 KiB after redaction', () => {
        const out = redactAndBound('x'.repeat(10000), {});
        expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(4096);
    });
});

test.describe('runOffHostSync execution contract', () => {
    test('exit 0 is a success receipt with the completion scope truth', async () => {
        const outcome = await runOffHostSync({
            bundleDir : '/tmp/b',
            bundleName: 'b',
            config    : {...VALID_CONFIG, argv: ['-e', 'process.exit(0)']}
        });

        expect(outcome.status).toBe('success');
        expect(outcome.exitCode).toBe(0);
        expect(outcome.terminatedVia).toBe('exit');
        expect(outcome.completionScope).toBe('direct-child');
        expect(outcome.descendants).toBe('unknown');
    });

    test('non-zero exit is a failed receipt with code and bounded stderr', async () => {
        const outcome = await runOffHostSync({
            bundleDir : '/tmp/b',
            bundleName: 'b',
            config    : {...VALID_CONFIG, argv: ['-e', 'console.error("boom");process.exit(3)']}
        });

        expect(outcome.status).toBe('failed');
        expect(outcome.exitCode).toBe(3);
        expect(outcome.stderrTail).toContain('boom');
    });

    test('the execFile timeout path records terminatedVia sigterm truthfully', async () => {
        const outcome = await runOffHostSync({
            bundleDir : '/tmp/b',
            bundleName: 'b',
            config    : {
                ...VALID_CONFIG,
                argv       : ['-e', 'setInterval(()=>{},50)'],
                killGraceMs: 50000, // grace far out: only execFile's own timeout may fire first
                timeoutMs  : 200
            }
        });

        expect(outcome.status).toBe('timeout');
        expect(outcome.terminatedVia).toBe('sigterm');
    });

    test('a failed SIGKILL send (ESRCH) is never reported as sigkill — the callback signal is the authority', async () => {
        // Deterministic: an injected child whose pid is provably dead (kill() -> ESRCH), with the
        // timeout callback arriving afterwards carrying SIGTERM. The failed kill MUST fire; the
        // outcome must still read sigterm, never sigkill.
        const deadPid = await new Promise((resolve, reject) => {
            const probe = spawn(process.execPath, ['-e', 'process.exit(0)'], {stdio: 'ignore'});
            probe.on('exit', code => code === 0 ? resolve(probe.pid) : reject(new Error('probe failed')));
            probe.on('error', reject);
        });
        expect(__private__.isProcessProvablyDead(deadPid)).toBe(true);

        const execFileImpl = (command, args, options, callback) => {
            setTimeout(() => {
                const error = new Error('Command was killed with SIGTERM');
                error.killed      = true;
                error.signal      = 'SIGTERM';
                callback(error)
            }, 50);

            return {pid: deadPid}
        };

        const outcome = await runOffHostSync({
            bundleDir : '/tmp/b',
            bundleName: 'b',
            execFileImpl,
            config    : {...VALID_CONFIG, killGraceMs: 0, timeoutMs: 0}
        });

        expect(outcome.status).toBe('timeout');
        expect(outcome.terminatedVia).toBe('sigterm');
        expect(outcome.terminatedVia).not.toBe('sigkill');
    });

    test('a SIGTERM-ignoring child receives SIGKILL within timeoutMs + killGraceMs', async () => {
        const startedAt = Date.now();
        const outcome   = await runOffHostSync({
            bundleDir : '/tmp/b',
            bundleName: 'b',
            config    : {
                ...VALID_CONFIG,
                argv       : ['-e', 'process.on("SIGTERM",()=>{});setInterval(()=>{},50)'],
                killGraceMs: 200,
                timeoutMs  : 200
            }
        });
        const elapsed = Date.now() - startedAt;

        expect(outcome.terminatedVia).toBe('sigkill');
        expect(elapsed).toBeLessThan(400 + 400); // bound + CI slack
    });

    test('whole-token placeholder substitution reaches the child', async () => {
        const outcome = await runOffHostSync({
            bundleDir : '/tmp/some/bundle-dir',
            bundleName: 'bundle-dir',
            config    : {...VALID_CONFIG, argv: ['-e', 'if(process.argv[1]!=="/tmp/some/bundle-dir"||process.argv[2]!=="bundle-dir")process.exit(9)', '{bundleDir}', '{bundleName}']}
        });

        expect(outcome.status).toBe('success');
    });
});

test.describe('backup receipt store', () => {
    test('envelope carries provenance and the disabled default', () => {
        const receipt = buildBackupReceipt({
            backup           : {durationMs: 12, error: null, status: 'success'},
            bundleCompletedAt: '2026-07-22T12:00:00Z',
            bundleName       : 'backup-2026-07-22'
        });

        expect(receipt.schemaVersion).toBe(1);
        expect(receipt.bundleName).toBe('backup-2026-07-22');
        expect(receipt.bundleCompletedAt).toBe('2026-07-22T12:00:00Z');
        expect(receipt.offHostSync.status).toBe('disabled');
    });

    test('atomic write + read round trip; stale temps are swept', async () => {
        const root = makeTmp();
        try {
            const filePath = path.join(root, 'last-backup-receipt.json');
            const deadPid  = await new Promise((resolve, reject) => {
                const child = spawn(process.execPath, ['-e', ''], {stdio: 'ignore'}),
                      pid   = child.pid;

                child.once('error', reject);
                child.once('exit', () => resolve(pid))
            });

            expect(__private__.isProcessProvablyDead(deadPid)).toBe(true);
            writeFileSync(path.join(root, `${path.basename(filePath)}.tmp-${deadPid}-111-1-stale`), '{}');

            const receipt = buildBackupReceipt({backup: {durationMs: 1, error: null, status: 'success'}, bundleName: 'b'});
            await writeBackupReceipt({filePath, receipt});

            expect(JSON.parse(readFileSync(filePath, 'utf8')).bundleName).toBe('b');
            expect(readdirSync(root).filter(e => e.includes('.tmp-'))).toEqual([]);

            const read = await readBackupReceipt({filePath});
            expect(read.status).toBe('ok');
            expect(read.receipt.bundleName).toBe('b');
        } finally {
            rmSync(root, {force: true, recursive: true})
        }
    });

    test('arbitrary schema-v1 JSON fails the validated allowlisted shape', async () => {
        const root = makeTmp();
        try {
            const filePath = path.join(root, 'last-backup-receipt.json');

            writeFileSync(filePath, JSON.stringify({schemaVersion: 1, finishedAt: 'x', backup: {status: 'success'}, offHostSync: {status: 'success'}}));
            expect(await readBackupReceipt({filePath})).toEqual({finishedAt: 'x', kind: 'corrupt', status: 'unreadable'});

            writeFileSync(filePath, JSON.stringify({schemaVersion: 1, bundleCompletedAt: null, bundleName: 'b', finishedAt: 'x',
                backup     : {durationMs: 1, error: null, status: 'success'},
                offHostSync: {completionScope: 'direct-child', descendants: 'unknown', durationMs: 1, exitCode: 0, signal: null, status: 'success', stderrTail: '', terminatedVia: 'exit'},
                smuggled   : 'field'}));
            const read = await readBackupReceipt({filePath});
            expect(read.status).toBe('ok');
            expect(read.receipt.smuggled).toBeUndefined(); // validated shape projects allowlisted fields only
        } finally {
            rmSync(root, {force: true, recursive: true})
        }
    });

    test('missing / corrupt / oversize / wrong-version read outcomes are stable', async () => {
        const root = makeTmp();
        try {
            const filePath = path.join(root, 'last-backup-receipt.json');

            expect(await readBackupReceipt({filePath})).toEqual({status: 'missing'});

            writeFileSync(filePath, 'not json{');
            expect(await readBackupReceipt({filePath})).toEqual({finishedAt: null, kind: 'corrupt', status: 'unreadable'});

            writeFileSync(filePath, JSON.stringify({finishedAt: '2026-07-22T00:00:00Z', schemaVersion: 99}));
            expect(await readBackupReceipt({filePath})).toEqual({finishedAt: '2026-07-22T00:00:00Z', kind: 'unsupported-version', status: 'unreadable'});

            writeFileSync(filePath, ' '.repeat(65 * 1024));
            expect(await readBackupReceipt({filePath})).toEqual({finishedAt: null, kind: 'oversize', status: 'unreadable'});
        } finally {
            rmSync(root, {force: true, recursive: true})
        }
    });

    test('same-millisecond sequential writes use distinct temp names', async () => {
        const root = makeTmp();
        try {
            const filePath = path.join(root, 'last-backup-receipt.json');
            const now      = 1710000000000;

            await writeBackupReceipt({filePath, now, receipt: buildBackupReceipt({backup: {durationMs: 1, error: null, status: 'success'}, bundleName: 'first'})});
            await writeBackupReceipt({filePath, now, receipt: buildBackupReceipt({backup: {durationMs: 2, error: null, status: 'success'}, bundleName: 'second'})});

            const read = await readBackupReceipt({filePath});
            expect(read.status).toBe('ok');
            expect(read.receipt.bundleName).toBe('second');
            expect(readdirSync(root).filter(e => e.includes('.tmp-'))).toEqual([]);
        } finally {
            rmSync(root, {force: true, recursive: true})
        }
    });

    test('read-side validation bounds hostile oversized diagnostics and rejects absolute provenance', async () => {
        const root = makeTmp();
        try {
            const filePath = path.join(root, 'last-backup-receipt.json');

            writeFileSync(filePath, JSON.stringify({schemaVersion: 1, bundleCompletedAt: null, bundleName: '/etc/passwd', finishedAt: 'x',
                backup     : {durationMs: 1, error: null, status: 'success'},
                offHostSync: {completionScope: 'direct-child', descendants: 'unknown', durationMs: 1, exitCode: 0, signal: null, status: 'success', stderrTail: '', terminatedVia: 'exit'}}));
            expect((await readBackupReceipt({filePath})).status).toBe('unreadable');

            const hugeTail = 'y'.repeat(9000);
            writeFileSync(filePath, JSON.stringify({schemaVersion: 1, bundleCompletedAt: null, bundleName: 'b', finishedAt: 'x',
                backup     : {durationMs: 1, error: hugeTail, status: 'success'},
                offHostSync: {completionScope: 'direct-child', descendants: 'unknown', durationMs: 1, exitCode: 0, signal: null, status: 'success', stderrTail: hugeTail, terminatedVia: 'exit'}}));
            const read = await readBackupReceipt({filePath});
            expect(read.status).toBe('ok');
            expect(read.receipt.backup.error.length).toBeLessThanOrEqual(4096);
            expect(read.receipt.offHostSync.stderrTail.length).toBeLessThanOrEqual(4096);
        } finally {
            rmSync(root, {force: true, recursive: true})
        }
    });

    test('the 64 KiB read cap fires from the opened handle before bounded allocation', async () => {
        const root = makeTmp();
        try {
            const filePath = path.join(root, 'last-backup-receipt.json');
            writeFileSync(filePath, ' '.repeat(70 * 1024));

            expect(await readBackupReceipt({filePath})).toEqual({finishedAt: null, kind: 'oversize', status: 'unreadable'});
        } finally {
            rmSync(root, {force: true, recursive: true})
        }
    });

    test('a torn previous receipt survives a failed capped write', async () => {
        const root = makeTmp();
        try {
            const filePath = path.join(root, 'last-backup-receipt.json');
            const good     = buildBackupReceipt({backup: {durationMs: 1, error: null, status: 'success'}, bundleName: 'good'});
            await writeBackupReceipt({filePath, receipt: good});

            const oversized = buildBackupReceipt({backup: {durationMs: 1, error: 'x'.repeat(70 * 1024), status: 'failed'}, bundleName: 'bad'});
            await expect(writeBackupReceipt({filePath, receipt: oversized})).rejects.toThrow('cap');

            const read = await readBackupReceipt({filePath});
            expect(read.receipt.bundleName).toBe('good');
        } finally {
            rmSync(root, {force: true, recursive: true})
        }
    });
});

test.describe('owner boundary + overlay order (source contracts)', () => {
    test('exported runBackup carries no off-host side effects; the CLI loads the overlay before any path resolution', async () => {
        const {readFileSync} = await import('node:fs');
        const source         = readFileSync(new URL('../../../../../../ai/scripts/maintenance/backup.mjs', import.meta.url), 'utf8');

        // The exported primitive's body never names the sync/receipt machinery
        const
            wrapperStart    = source.indexOf('export async function runBackupWithOffHostSync'),
            wrapperDocStart = source.lastIndexOf('/**', wrapperStart),
            runBackupBody   = source.slice(source.indexOf('export async function runBackup({'), wrapperDocStart);
        expect(runBackupBody).not.toContain('runOffHostSync');
        expect(runBackupBody).not.toContain('writeBackupReceipt');

        // Overlay-load-first: the CLI footer loads the top-level overlay BEFORE the wrapper runs
        const footer = source.slice(source.indexOf("if (import.meta.url === `file://"));
        expect(footer.indexOf('await loadTopLevelAiConfig()')).toBeLessThan(footer.indexOf('runBackupWithOffHostSync()'));
        expect(footer).toContain('.catch(error => {');
        expect(footer).toContain('reportBackupTerminalFailure(error);');
        expect(footer).toContain('process.exit(1)');

        // Bundle root + retention resolve from the AiConfig leaf, never the module constant
        expect(source).toContain('path.join(AiConfig.backupPath, `backup-${timestamp}`)');
        expect(source).toContain('cleanOldBackupsImpl(AiConfig.backupPath, logger, retention)');
        expect(runBackupBody).not.toContain('DEFAULT_BACKUP_ROOT, `backup-');
    });
});

test.describe('wrapper lease/truth semantics (source contracts + projection shapes)', () => {
    test('the wrapper keeps both receipts inside the lease callback and scopes durationMs to the local backup', async () => {
        const {readFileSync} = await import('node:fs');
        const source         = readFileSync(new URL('../../../../../../ai/scripts/maintenance/backup.mjs', import.meta.url), 'utf8');

        const wrapperBody = source.slice(source.indexOf('export async function runBackupWithOffHostSync'));

        // the lease callback CONTAINS the failure receipt + the sync + the success receipt
        const leaseBody = wrapperBody.slice(0, wrapperBody.indexOf("owner: 'backup'"));
        expect(leaseBody).toContain('(withLeaseImpl ?? withHeavyMaintenanceLease)(async () =>');
        expect(leaseBody).toContain("syncStatus       : 'not-run-backup-failed'");
        const syncCall = 'syncOutcome = await runOffHostSyncImpl';
        expect(leaseBody).toContain(syncCall);
        expect(leaseBody).toContain('writeBackupReceipt');
        expect(leaseBody).toContain('resolveCloudOnlyDefault(');
        expect(leaseBody).toContain('AiConfig.orchestrator.cloudOnly.offHostBackupRequired');
        expect(leaseBody).toContain('AiConfig.orchestrator.deploymentMode');

        // no receipt write happens outside the lease call
        const afterLease = wrapperBody.slice(wrapperBody.indexOf("owner: 'backup'"));
        expect(afterLease).not.toContain('writeBackupReceipt({');

        // backup.durationMs measures runBackup only, never sync time
        expect(leaseBody.indexOf('backupStartedAt')).toBeLessThan(leaseBody.indexOf(syncCall));
        expect(leaseBody).toContain('backupDurationMs');

        // unexpected sync errors become a sync outcome, never a backup failure
        expect(leaseBody).toContain("status         : 'failed',");
        expect(leaseBody).toContain('catch (syncError)');
    });

    test('the bridge imports the receipt store directly from the helper (never the script)', async () => {
        const {readFileSync} = await import('node:fs');
        const bridge         = readFileSync(new URL('../../../../../../ai/daemons/orchestrator/services/DeploymentStateBridgeService.mjs', import.meta.url), 'utf8');

        expect(bridge).toContain("from '../../../services/memory-core/helpers/offHostSyncStore.mjs'");
        expect(bridge).not.toContain("from '../../../scripts/maintenance/offHostSync.mjs'");
    });

    test('the projection contract: absent omits the block; unreadable uses the stable shape; valid passes the validated envelope', async () => {
        const {readFileSync} = await import('node:fs');
        const store          = readFileSync(new URL('../../../../../../ai/services/memory-core/helpers/deploymentStateBridgeStore.mjs', import.meta.url), 'utf8');

        // absent-before-first-run: the maintenance key is conditionally added, never fabricated as null
        expect(store).toContain('if (maintenance !== null && maintenance !== undefined)');
        expect(store).toContain('snapshot.maintenance = maintenance');

        // additive tolerance: the inspector tolerates absence of additive sections
        expect(store).toContain("ADDITIVE_SNAPSHOT_SECTIONS = ['maintenance']");
    });

    test('the unreadable projection shape is one machine-consumable envelope', async () => {
        const root = makeTmp();
        try {
            const filePath = path.join(root, 'last-backup-receipt.json');
            writeFileSync(filePath, 'not json{');

            const outcome = await readBackupReceipt({filePath});
            expect(outcome).toEqual({finishedAt: null, kind: 'corrupt', status: 'unreadable'});
        } finally {
            rmSync(root, {force: true, recursive: true})
        }
    });
});

test.describe('wrapper + projection behavioral witnesses', () => {
    const fakeBundle = root => ({
        bundleRoot : path.join(root, 'backup-2026-07-22T12-00-00-000Z'),
        completedAt: '2026-07-22T12:00:01.000Z'
    });

    const completedLease = result => async fn => ({status: 'completed', result: await fn()});

    const fakeSyncOutcome = status => ({
        completionScope: 'direct-child',
        descendants    : 'unknown',
        durationMs     : 1,
        exitCode       : status === 'success' ? 0 : 3,
        signal         : null,
        status,
        stderrTail     : 'credential-canary /private/secret/cloud-target',
        terminatedVia  : 'exit'
    });

    test('success path: receipt carries provenance, sync outcome, and a local-backup-scoped duration', async () => {
        const root = makeTmp();
        try {
            const {runBackupWithOffHostSync} = await import('../../../../../../ai/scripts/maintenance/backup.mjs');
            const result                     = await runBackupWithOffHostSync({
                runBackupImpl        : async () => fakeBundle(root),
                withLeaseImpl        : completedLease(),
                backupRoot           : root,
                offHostBackupRequired: false
            });

            expect(result.result.bundleRoot).toContain('backup-2026-07-22');

            const read = await readBackupReceipt({filePath: path.join(root, 'last-backup-receipt.json')});
            expect(read.status).toBe('ok');
            expect(read.receipt.backup.status).toBe('success');
            expect(read.receipt.bundleName).toBe('backup-2026-07-22T12-00-00-000Z');
            expect(read.receipt.bundleCompletedAt).toBe('2026-07-22T12:00:01.000Z');
            expect(read.receipt.offHostSync.status).toBe('disabled');
            expect(read.receipt.backup.durationMs).toBeLessThan(5000); // local backup time, not sync time
        } finally {
            rmSync(root, {force: true, recursive: true})
        }
    });

    test('failure path: a thrown backup writes the not-run receipt INSIDE the lease with backup.status failed', async () => {
        const root = makeTmp();
        try {
            const {runBackupWithOffHostSync} = await import('../../../../../../ai/scripts/maintenance/backup.mjs');

            await expect(runBackupWithOffHostSync({
                runBackupImpl: async () => { throw new Error('integrity check failed') },
                withLeaseImpl: completedLease(),
                backupRoot   : root
            })).rejects.toThrow('integrity check failed');

            const read = await readBackupReceipt({filePath: path.join(root, 'last-backup-receipt.json')});
            expect(read.status).toBe('ok');
            expect(read.receipt.backup.status).toBe('failed');
            expect(read.receipt.backup.error).toContain('integrity check failed');
            expect(read.receipt.bundleName).toBe(null);
            expect(read.receipt.offHostSync.status).toBe('not-run-backup-failed');
        } finally {
            rmSync(root, {force: true, recursive: true})
        }
    });

    test('required/optional terminal matrix preserves the receipt before deciding the operation', async () => {
        const {
            REQUIRED_OFFHOST_BACKUP_ERROR_CODE,
            reportBackupTerminalFailure,
            runBackupWithOffHostSync
        } = await import('../../../../../../ai/scripts/maintenance/backup.mjs');

        const cases = [
            {status: 'disabled',          syncConfig: {command: ''}},
            {status: 'validation-failed', syncConfig: {command: 'rsync', argv: ['--token=credential-canary{bad}']}},
            {status: 'failed',            syncConfig: VALID_CONFIG},
            {status: 'timeout',           syncConfig: VALID_CONFIG},
            {status: 'success',           syncConfig: VALID_CONFIG}
        ];

        for (const offHostBackupRequired of [false, true]) {
            for (const {status, syncConfig} of cases) {
                const root = makeTmp();

                try {
                    const
                        warnings     = [],
                        originalWarn = console.warn;

                    console.warn = (...args) => warnings.push(args.map(String).join(' '));

                    const run = runBackupWithOffHostSync({
                        runBackupImpl     : async () => fakeBundle(root),
                        withLeaseImpl     : completedLease(),
                        backupRoot        : root,
                        syncConfig,
                        runOffHostSyncImpl: async () => fakeSyncOutcome(status),
                        offHostBackupRequired
                    }).finally(() => {
                        console.warn = originalWarn
                    });

                    if (offHostBackupRequired && status !== 'success') {
                        const error = await run.then(() => null, value => value);

                        expect(error).toBeInstanceOf(Error);
                        expect(error).toMatchObject({
                            code             : REQUIRED_OFFHOST_BACKUP_ERROR_CODE,
                            message          : expect.not.stringContaining('credential-canary'),
                            offHostSyncStatus: status
                        });
                        expect(warnings.join('\n')).not.toContain('credential-canary');
                        expect(warnings.join('\n')).not.toContain('/private/secret/cloud-target');

                        const terminal = [];
                        reportBackupTerminalFailure(error, {error: (...args) => terminal.push(args.map(String).join(' '))});

                        expect(terminal).toEqual([
                            `❌ Backup failed: ${REQUIRED_OFFHOST_BACKUP_ERROR_CODE} (status=${status}).`
                        ]);
                        expect(terminal.join('\n')).not.toContain('credential-canary');
                        expect(terminal.join('\n')).not.toContain('/private/secret/cloud-target');
                    } else {
                        await expect(run).resolves.toMatchObject({status: 'completed'});

                        if (!offHostBackupRequired && ['validation-failed', 'failed', 'timeout'].includes(status)) {
                            expect(warnings).toHaveLength(1)
                        }
                    }

                    const read = await readBackupReceipt({filePath: path.join(root, 'last-backup-receipt.json')});
                    expect(read.status).toBe('ok');
                    expect(read.receipt.backup.status).toBe('success');
                    expect(read.receipt.offHostSync.status).toBe(status)
                } finally {
                    rmSync(root, {force: true, recursive: true})
                }
            }
        }
    });

    test('projection: missing omits lastBackup but KEEPS the durability posture; unreadable → stable shape; valid → the validated envelope; custom root round trip', async () => {
        const root = makeTmp();
        try {
            const bridge  = (await import('../../../../../../ai/daemons/orchestrator/services/DeploymentStateBridgeService.mjs')).default;
            const collect = opts => bridge.prototype.collectMaintenanceSnapshot.call({}, opts);

            const receiptPath = path.join(root, 'last-backup-receipt.json');

            // A missing receipt still omits `lastBackup` — that absent-before-first-run semantic is
            // unchanged — but the section is no longer dropped wholesale, because the durability
            // posture is a property of CONFIG and is therefore knowable before any backup has run.
            // Returning `null` here made "no backup has ever run on this deployment"
            // indistinguishable from "nothing about maintenance is reportable".
            const beforeFirstRun = await collect({receiptPath});

            expect(beforeFirstRun).not.toBe(null);
            expect(beforeFirstRun.lastBackup).toBeUndefined();
            expect(beforeFirstRun.durability.posture).toBeTruthy();
            expect(beforeFirstRun.health.status).toBeTruthy();

            await writeBackupReceipt({
                filePath: receiptPath,
                receipt : buildBackupReceipt({
                    backup           : {durationMs: 42, error: null, status: 'success'},
                    bundleCompletedAt: '2026-07-22T12:00:01.000Z',
                    bundleName       : 'backup-2026-07-22'
                })
            });

            const projected = await collect({receiptPath});
            expect(projected.lastBackup.bundleName).toBe('backup-2026-07-22');
            expect(projected.lastBackup.backup.status).toBe('success');
            expect(projected.health.status).toBeTruthy();

            writeFileSync(receiptPath, 'not json{');
            const unreadable = await collect({receiptPath});
            expect(unreadable.lastBackup).toEqual({finishedAt: null, kind: 'corrupt', status: 'unreadable'});
            expect(unreadable.health.reasonCodes).toContain('backup-receipt-unreadable');
        } finally {
            rmSync(root, {force: true, recursive: true})
        }
    });

    /**
     * `.backup-partial-*` residue is invisible to all five root-level enumerators by construction —
     * that invisibility is the safety property — so the orchestrator snapshot is the only place its
     * footprint can be seen. The Memory Core healthcheck's backup block reads the backup DIRECTORY
     * and `mc-server` holds no backup mount, so it reports `count: 0` from a blind container: a true
     * statement carrying no information, indistinguishable from a passing check.
     */
    test('projection: staging-residue count and bytes ride the orchestrator snapshot, reported even when clean (#16427)', async () => {
        const root = makeTmp();
        try {
            const bridge  = (await import('../../../../../../ai/daemons/orchestrator/services/DeploymentStateBridgeService.mjs')).default;
            const collect = opts => bridge.prototype.collectMaintenanceSnapshot.call({}, opts);

            const receiptPath = path.join(root, 'last-backup-receipt.json');

            // Reported as an explicit zero, never omitted: "no residue" must not read the same as
            // "nothing about residue is reportable" — the failure the durability block exists to end.
            const clean = await collect({receiptPath, stagingResidueRoot: root});
            expect(clean.stagingResidue).toEqual({
                bytes: 0, count: 0, errorCode: null, oldestMtimeMs: null, status: 'ok'
            });

            mkdirSync(path.join(root, '.backup-partial-backup-2026-08-03-aaa'), {recursive: true});
            writeFileSync(path.join(root, '.backup-partial-backup-2026-08-03-aaa', 'memories.jsonl'), 'x'.repeat(64));
            mkdirSync(path.join(root, '.backup-partial-backup-2026-08-03-bbb'), {recursive: true});

            // A published bundle must not be counted as residue — the two namespaces stay disjoint.
            mkdirSync(path.join(root, 'backup-2026-08-03T00-00-00.000Z'), {recursive: true});

            const withResidue = await collect({receiptPath, stagingResidueRoot: root});
            expect(withResidue.stagingResidue.status).toBe('ok');
            expect(withResidue.stagingResidue.count).toBe(2);
            expect(withResidue.stagingResidue.bytes).toBe(64);
            expect(withResidue.stagingResidue.oldestMtimeMs).toBeGreaterThan(0);

            // An unreadable root must NOT reach the snapshot as a measured zero. The projection
            // still writes — observability degrades, never blocks — but it says so, and the counts
            // are null so nothing downstream can sum a measurement that never happened.
            // The specimen is a regular FILE that exists: an absent path is ENOENT, which is a real
            // answer and correctly reports `ok`, so it could not discriminate here.
            const notADirectory = path.join(root, 'not-a-directory');
            writeFileSync(notADirectory, 'x');

            const unreadable = await collect({receiptPath, stagingResidueRoot: notADirectory});
            expect(unreadable.stagingResidue).toMatchObject({
                bytes    : null,
                count    : null,
                errorCode: 'ENOTDIR',
                status   : 'unreadable'
            });
        } finally {
            rmSync(root, {force: true, recursive: true})
        }
    });
});

test.describe('adversarial IO + encoding edges', () => {
    test('a synchronous spawn throw becomes a failed outcome with terminatedVia null (no child started)', async () => {
        const outcome = await runOffHostSync({
            bundleDir : '/tmp/b',
            bundleName: 'b',
            config    : {...VALID_CONFIG, command: '/definitely/not/a/real/executable-9f3c2a'},
        });

        expect(outcome.status).toBe('failed');
        expect(outcome.terminatedVia).toBe(null);
    });

    test('UTF-8-safe bounding: multibyte-heavy diagnostics stay within the byte cap on write and projection paths', async () => {
        const emojiError = '🔥'.repeat(5000);

        const boundedWrite = redactAndBound(emojiError, {});
        expect(Buffer.byteLength(boundedWrite, 'utf8')).toBeLessThanOrEqual(4096);

        const root = makeTmp();
        try {
            const filePath = path.join(root, 'last-backup-receipt.json');
            writeFileSync(filePath, JSON.stringify({schemaVersion: 1, bundleCompletedAt: null, bundleName: 'b', finishedAt: 'x',
                backup     : {durationMs: 1, error: emojiError, status: 'success'},
                offHostSync: {completionScope: 'direct-child', descendants: 'unknown', durationMs: 1, exitCode: 0, signal: null, status: 'success', stderrTail: emojiError, terminatedVia: 'exit'}}));

            const read = await readBackupReceipt({filePath});
            expect(read.status).toBe('ok');
            expect(Buffer.byteLength(read.receipt.backup.error, 'utf8')).toBeLessThanOrEqual(4096);
            expect(Buffer.byteLength(read.receipt.offHostSync.stderrTail, 'utf8')).toBeLessThanOrEqual(4096);
        } finally {
            rmSync(root, {force: true, recursive: true})
        }
    });

    test('basename-only provenance rejects POSIX, Windows, and drive-letter absolute forms', async () => {
        const root = makeTmp();
        try {
            const filePath = path.join(root, 'last-backup-receipt.json');

            for (const bundleName of ['a/b', 'a\\b', 'C:\\evil']) {
                writeFileSync(filePath, JSON.stringify({schemaVersion: 1, bundleCompletedAt: null, bundleName, finishedAt: 'x',
                    backup     : {durationMs: 1, error: null, status: 'success'},
                    offHostSync: {completionScope: 'direct-child', descendants: 'unknown', durationMs: 1, exitCode: 0, signal: null, status: 'success', stderrTail: '', terminatedVia: 'exit'}}));
                expect((await readBackupReceipt({filePath})).status).toBe('unreadable');
            }
        } finally {
            rmSync(root, {force: true, recursive: true})
        }
    });

    test('concurrent adjacent-millisecond writes complete without temp collisions', async () => {
        const root = makeTmp();
        try {
            const filePath = path.join(root, 'last-backup-receipt.json');
            const t        = 1710000000000;

            await Promise.all([
                writeBackupReceipt({filePath, now: t,     receipt: buildBackupReceipt({backup: {durationMs: 1, error: null, status: 'success'}, bundleName: 'first'})}),
                writeBackupReceipt({filePath, now: t + 1, receipt: buildBackupReceipt({backup: {durationMs: 2, error: null, status: 'success'}, bundleName: 'second'})}),
                writeBackupReceipt({filePath, now: t,     receipt: buildBackupReceipt({backup: {durationMs: 3, error: null, status: 'success'}, bundleName: 'third'})})
            ]);

            const read = await readBackupReceipt({filePath});
            expect(read.status).toBe('ok');
            expect(['first', 'second', 'third']).toContain(read.receipt.bundleName);
            expect(readdirSync(root).filter(e => e.includes('.tmp-'))).toEqual([]);
        } finally {
            rmSync(root, {force: true, recursive: true})
        }
    });

    test('stale sweep preserves an old open temp whose encoded owner is still alive', async () => {
        const root = makeTmp();
        try {
            const
                filePath   = path.join(root, 'last-backup-receipt.json'),
                startedAt  = 1710000000000,
                livePath   = path.join(root, `${path.basename(filePath)}.tmp-${process.pid}-${startedAt}-1-live`),
                commitPath = path.join(root, 'live-writer-commit.json'),
                handle     = await open(livePath, 'w');

            try {
                await handle.write('live writer payload');
                await handle.sync();

                await writeBackupReceipt({
                    filePath,
                    now    : startedAt + 60_001,
                    receipt: buildBackupReceipt({backup: {durationMs: 1, error: null, status: 'success'}, bundleName: 'newer'})
                })
            } finally {
                await handle.close()
            }

            await rename(livePath, commitPath);
            expect(readFileSync(commitPath, 'utf8')).toBe('live writer payload')
        } finally {
            rmSync(root, {force: true, recursive: true})
        }
    });

    test('opened-handle reader loops across legal short reads and decodes only delivered bytes', async () => {
        const
            receipt = buildBackupReceipt({backup: {durationMs: 1, error: null, status: 'success'}, bundleName: 'short-read'}),
            payload = Buffer.from(JSON.stringify(receipt));

        let calls = 0;

        const handle = {
            async read(buffer, offset, length, position) {
                const bytesRead = Math.min(length, 7);

                payload.copy(buffer, offset, position, position + bytesRead);
                calls++;

                return {buffer, bytesRead}
            }
        };

        const raw = await __private__.readOpenedFile(handle, payload.length);

        expect(calls).toBeGreaterThan(1);
        expect(JSON.parse(raw.toString('utf8')).bundleName).toBe('short-read')
    });
});

/**
 * @summary The receipt cannot assert `success` while hiding that the bundle exported nothing.
 *
 * Observed live: a receipt reading `"backup": {"status": "success"}` beside a `bundle-meta.json`
 * whose own integrity block read `empty` for every subsystem. Both statements were true —
 * the run DID complete — but a consumer reading only the receipt had no way to learn the bundle
 * was not a recovery source, and the receipt is the artifact operators and health surfaces reach
 * for first.
 *
 * `status` keeps its meaning deliberately: it reports whether the local bundle completed, which is
 * a real and useful fact. The fix is that it stops being the ONLY fact a receipt-only consumer sees.
 *
 * The disqualification rule lives in exactly one module so this and the health surface cannot drift
 * into disagreeing about what "restorable" means — two copies of one rule is how the two halves of
 * a contract end up one edit apart.
 */
test.describe('backup receipt — the integrity verdict travels with the status', () => {
    const EMPTY = [
        {subsystem: 'kb', status: 'empty', sourceCount: 0, bundleCount: 0},
        {subsystem: 'mc', status: 'empty', sourceCount: 0, bundleCount: 0}
    ];
    const CLEAN = [{subsystem: 'kb', status: 'pass', sourceCount: 61206, bundleCount: 61206}];

    test('a zero-row bundle is marked NOT restorable, and names which subsystems brought back nothing', () => {
        const receipt = buildBackupReceipt({
            backup    : {durationMs: 24, error: null, status: 'success'},
            bundleName: 'backup-2026-07-31T04-57-18.233Z',
            integrity : EMPTY
        });

        // The run completed — that stays true and stays reported.
        expect(receipt.backup.status).toBe('success');
        // …and the receipt now also says it is not a recovery source, with the reason named.
        expect(receipt.integrity.restorable).toBe(false);
        expect(receipt.integrity.emptySubsystems).toEqual(['kb', 'mc']);
    });

    test('the projection KEY is wire-stable at schemaVersion 1 — a receipt reader must not lose the field', () => {
        // This key was briefly renamed to `zeroRowSubsystems` for lexical clarity. A receipt is read
        // by whatever version is deployed where it lands, and a reader looking for `emptySubsystems`
        // finds `undefined` — which reads as "no subsystem was empty", not as "I do not understand this
        // receipt". Renaming a projected key without a schemaVersion bump is the same class of silent
        // downgrade as renaming the status token itself.
        const receipt = buildBackupReceipt({
            backup    : {durationMs: 24, error: null, status: 'success'},
            bundleName: 'backup-2026-06-14T02-11-05.000Z',
            integrity : [{subsystem: 'kb', status: 'empty', sourceCount: 0, bundleCount: 0}]
        });

        expect(Object.keys(receipt.integrity).sort()).toEqual(['emptySubsystems', 'restorable']);
        expect(receipt.integrity.emptySubsystems).toEqual(['kb']);
        expect(receipt.integrity.restorable).toBe(false);
    });

    test('POSITIVE CONTROL: a clean bundle is restorable and names nothing', () => {
        const receipt = buildBackupReceipt({
            backup    : {durationMs: 900, error: null, status: 'success'},
            bundleName: 'backup-2026-07-30T19-28-57.348Z',
            integrity : CLEAN
        });

        expect(receipt.integrity.restorable).toBe(true);
        expect(receipt.integrity.emptySubsystems).toEqual([]);
    });

    test('an ABSENT verdict is unknown, never false — old receipts must not read as unusable', () => {
        // Receipts predate this field. Treating absence as "not restorable" would retroactively
        // condemn every historical bundle, which is a worse outage than the bug being fixed.
        const receipt = buildBackupReceipt({
            backup    : {durationMs: 900, error: null, status: 'success'},
            bundleName: 'backup-2026-07-01T13-23-24.995Z'
        });

        expect(receipt.integrity.restorable).toBeNull();
        expect(receipt.integrity.emptySubsystems).toEqual([]);
    });

    test('the schema version is UNCHANGED — the field is additive or existing receipts are rejected', () => {
        // `readBackupReceipt` refuses any receipt whose `schemaVersion` differs. Bumping it here
        // would make every receipt already on disk unreadable — the field has to be additive.
        const receipt = buildBackupReceipt({backup: {durationMs: 1, error: null, status: 'success'}, bundleName: 'b'});

        expect(receipt.schemaVersion).toBe(1);
    });
});
