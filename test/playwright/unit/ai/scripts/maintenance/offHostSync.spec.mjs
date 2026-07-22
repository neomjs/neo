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
