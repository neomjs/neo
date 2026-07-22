import {test, expect}                                                  from '@playwright/test';
import {mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync} from 'node:fs';
import {tmpdir}                                                        from 'node:os';
import path                                                            from 'node:path';

import {
    buildBackupReceipt,
    buildSyncChildEnv,
    redactAndBound,
    runOffHostSync,
    validateOffHostSyncConfig,
    writeBackupReceipt
} from '../../../../../../ai/scripts/maintenance/offHostSync.mjs';
import {readBackupReceipt} from '../../../../../../ai/services/memory-core/helpers/offHostSyncStore.mjs';

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
        expect(validateOffHostSyncConfig({command: ''})).toEqual({enabled: false, error: null, value: null});
        expect(validateOffHostSyncConfig(undefined)).toEqual({enabled: false, error: null, value: null});
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
            writeFileSync(path.join(root, `${path.basename(filePath)}.tmp-999-111`), '{}');

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

    test('two writes in the same millisecond on the same pid never collide (deterministic race witness)', async () => {
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

    test('the 64 KiB read cap fires from stat before whole-file allocation', async () => {
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
        const runBackupBody = source.slice(source.indexOf('export async function runBackup({'), source.indexOf('export async function runBackupWithOffHostSync'));
        expect(runBackupBody).not.toContain('runOffHostSync');
        expect(runBackupBody).not.toContain('writeBackupReceipt');

        // Overlay-load-first: the CLI footer loads the top-level overlay BEFORE the wrapper runs
        const footer = source.slice(source.indexOf("if (import.meta.url === `file://"));
        expect(footer.indexOf('await loadTopLevelAiConfig()')).toBeLessThan(footer.indexOf('runBackupWithOffHostSync()'));

        // Bundle root + retention resolve from the AiConfig leaf, never the module constant
        expect(source).toContain('path.join(AiConfig.backupPath, `backup-${timestamp}`)');
        expect(source).toContain('cleanOldBackups(AiConfig.backupPath,');
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
        expect(leaseBody).toContain('withHeavyMaintenanceLease(async () =>');
        expect(leaseBody).toContain("syncStatus       : 'not-run-backup-failed'");
        expect(leaseBody).toContain('runOffHostSync');
        expect(leaseBody).toContain('writeBackupReceipt');

        // no receipt write happens outside the lease call
        const afterLease = wrapperBody.slice(wrapperBody.indexOf("owner: 'backup'"));
        expect(afterLease).not.toContain('writeBackupReceipt({');

        // backup.durationMs measures runBackup only, never sync time
        expect(leaseBody.indexOf('backupStartedAt')).toBeLessThan(leaseBody.indexOf('runOffHostSync'));
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
