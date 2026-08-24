import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';
import {expect, test} from '@playwright/test';
import BenchmarkSystemReporter, {
    BROWSER_LIFECYCLE_RECEIPT_RECORD_TYPE,
    classifyBrowserLaunchExit,
    pruneBrowserLifecycleReceipts,
    readOptionalSystemFact,
    resolveBrowserKind,
    resolveBrowserLifecycleReceipt,
    resolveE2eProfileName
} from '../../e2e/custom-reporter.js';

const launchExit = ({
    exitCode = 'null',
    launchCommand = null,
    pid = 4242,
    prefix = 'Error: browserType.launch: Failed to launch the browser process.',
    signal = 'SIGABRT'
} = {}) => [
    prefix,
    'Browser logs:',
    '',
    launchCommand ? `<launching> ${launchCommand}` : null,
    `<launched> pid=${pid}`,
    `[pid=${pid}] <process did exit: exitCode=${exitCode}, signal=${signal}>`
].filter(Boolean).join('\n');

/**
 * @summary Coverage for the bounded E2E browser-launch lifecycle receipt.
 *
 * The reporter owns classification and retention only. Playwright still owns the browser and the
 * failing launch already owns the test result. These units therefore use the exact public error-log
 * version-pinned runner grammar with fakes instead of creating another browser lifecycle merely
 * to test diagnostics.
 */
test.describe('e2e/custom-reporter browser lifecycle', () => {
    test('#16161 binds the internal launch-exit grammar to Playwright Core 1.61.1', async () => {
        const manifest = await fs.readJson(path.resolve('node_modules/playwright-core/package.json'));

        expect(manifest.version).toBe('1.61.1')
    });

    test('#16161 classifies SIGABRT without inventing transport state', () => {
        expect(classifyBrowserLaunchExit(launchExit(), {
            browserName: 'chromium',
            channel    : 'chrome',
            headless   : true,
            profile    : 'presenting',
            project    : 'chromium'
        })).toEqual({
            classification          : 'browser-launch-process-exit',
            project                 : 'chromium',
            channel                 : 'chrome',
            browserKind             : 'branded-chrome',
            launchMode              : 'headless',
            profile                 : 'presenting',
            processId               : 4242,
            exitCode                : null,
            signal                  : 'SIGABRT',
            abnormal                : true,
            browserObjectEstablished: false,
            cause                   : 'unclassified-process-exit',
            remedy                  : 'inspect-retained-launch-exit',
            transportState          : 'not-observable'
        });

        expect(classifyBrowserLaunchExit(launchExit({exitCode: '0', signal: 'null'}))).toMatchObject({
            exitCode: 0,
            signal  : null,
            abnormal: false
        })
    });

    test('#17595 resolves only bounded browser kinds and launch modes', () => {
        expect(resolveBrowserKind({browserName: 'chromium', channel: 'chrome'})).toBe('branded-chrome');
        expect(resolveBrowserKind({browserName: 'chromium', channel: 'msedge'})).toBe('branded-edge');
        expect(resolveBrowserKind({browserName: 'chromium'})).toBe('bundled-chromium');
        expect(resolveBrowserKind({browserName: 'firefox'})).toBe('firefox');
        expect(resolveBrowserKind({browserName: 'webkit'})).toBe('webkit');
        expect(resolveBrowserKind({
            browserName: 'chromium',
            channel    : 'custom-browser'
        })).toBe('unknown');

        expect(classifyBrowserLaunchExit(launchExit(), {headless: false})).toMatchObject({
            launchMode: 'headed'
        });
        expect(classifyBrowserLaunchExit(launchExit(), {headless: true})).toMatchObject({
            launchMode: 'headless'
        });
        expect(classifyBrowserLaunchExit(launchExit())).toMatchObject({
            launchMode: 'unknown'
        });

        expect(classifyBrowserLaunchExit(launchExit({
            launchCommand: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless --no-sandbox'
        }), {browserName: 'chromium', headless: false})).toMatchObject({
            launchMode: 'headless'
        });
        expect(classifyBrowserLaunchExit(launchExit({
            launchCommand: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --no-sandbox'
        }), {browserName: 'chromium', headless: true})).toMatchObject({
            launchMode: 'headed'
        })
    });

    test('#17595 names Mach permission denial only from its exact token', () => {
        const permissionDenied = [
            launchExit({signal: 'SIGTRAP'}),
            'bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer.4242:',
            'Permission denied (1100)'
        ].join('\n');

        expect(classifyBrowserLaunchExit(permissionDenied)).toMatchObject({
            cause : 'macos-mach-service-permission-denied',
            remedy: 'retry-with-approved-execution-boundary'
        });

        expect(classifyBrowserLaunchExit(launchExit())).toMatchObject({
            cause : 'unclassified-process-exit',
            remedy: 'inspect-retained-launch-exit'
        });
        expect(classifyBrowserLaunchExit(
            permissionDenied.replace('Permission denied (1100)', 'Permission denied (1101)')
        )).toMatchObject({
            cause : 'unclassified-process-exit',
            remedy: 'inspect-retained-launch-exit'
        })
    });

    test('#16161 requires launch ownership and strips ANSI before matching', () => {
        expect(classifyBrowserLaunchExit(
            '[pid=4242] <process did exit: exitCode=0, signal=null>'
        )).toBeNull();

        expect(classifyBrowserLaunchExit(
            'Error: Target page, context or browser has been closed'
        )).toBeNull();

        expect(classifyBrowserLaunchExit(launchExit({
            prefix: 'Error: browserType.launchPersistentContext: Target page, context or browser has been closed'
        }))).toBeNull();

        const error = launchExit({
            prefix: '\u001B[31mError: browserType.launch: Target page, context or browser has been closed\u001B[0m'
        });

        expect(classifyBrowserLaunchExit(error)).toMatchObject({
            processId: 4242,
            signal   : 'SIGABRT'
        })
    });

    test('#16161 keeps film as a presenting run mode instead of inventing a third launch profile', () => {
        const
            previousEngine = process.env.NEO_E2E_ENGINE_PROFILE,
            previousFilm   = process.env.NEO_FILM_TAKE;

        try {
            delete process.env.NEO_E2E_ENGINE_PROFILE;
            delete process.env.NEO_FILM_TAKE;
            expect(resolveE2eProfileName()).toBe('presenting');

            process.env.NEO_FILM_TAKE = '1';
            expect(resolveE2eProfileName()).toBe('presenting');

            delete process.env.NEO_FILM_TAKE;
            process.env.NEO_E2E_ENGINE_PROFILE = '1';
            expect(resolveE2eProfileName()).toBe('engine')
        } finally {
            if (previousEngine === undefined) {
                delete process.env.NEO_E2E_ENGINE_PROFILE
            } else {
                process.env.NEO_E2E_ENGINE_PROFILE = previousEngine
            }

            if (previousFilm === undefined) {
                delete process.env.NEO_FILM_TAKE
            } else {
                process.env.NEO_FILM_TAKE = previousFilm
            }
        }
    });

    test('#16161 optional host telemetry fails soft instead of erasing the receipt', () => {
        expect(readOptionalSystemFact(() => {
            const error = new Error('uv_uptime returned EPERM');
            error.code = 'EPERM';
            throw error
        })).toBeNull();

        expect(readOptionalSystemFact(() => {
            throw new Error('restricted')
        }, 'Unknown')).toBe('Unknown')
    });

    test('#17679 resolves one safe per-run receipt path without rewriting a supplied run id', () => {
        const supplied = resolveBrowserLifecycleReceipt({
            receiptRoot: '/tmp/browser-lifecycle',
            runId      : 'battery/run 1'
        });
        const minted = resolveBrowserLifecycleReceipt({
            createRunId: () => 'opaque-minted-id',
            receiptRoot: '/tmp/browser-lifecycle',
            runId      : null
        });

        expect(supplied.runId).toBe('battery/run 1');
        expect(minted.runId).toBe('opaque-minted-id');
        expect(path.dirname(supplied.outputFile)).toBe('/tmp/browser-lifecycle');
        expect(path.dirname(minted.outputFile)).toBe('/tmp/browser-lifecycle');
        expect(path.basename(supplied.outputFile)).toMatch(/^receipt-[a-f0-9]{64}\.json$/);
        expect(path.basename(minted.outputFile)).toMatch(/^receipt-[a-f0-9]{64}\.json$/);
        expect(supplied.outputFile).not.toBe(minted.outputFile);
        expect(() => resolveBrowserLifecycleReceipt({receiptRoot: '', runId: 'run'})).toThrow(
            'Browser lifecycle receipt root must be a non-empty string'
        );
        expect(() => resolveBrowserLifecycleReceipt({createRunId: () => '', runId: null})).toThrow(
            'Browser lifecycle run id must be a non-empty string'
        )
    });

    test('#17679 control: a fixed output file retains only the second launch exit', async () => {
        const root       = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-browser-lifecycle-fixed-')),
              outputFile = path.join(root, 'benchmark-system-info.json'),
              project    = {name: 'chromium', use: {browserName: 'chromium', channel: 'chrome', headless: true}};

        try {
            for (const [runId, pid] of [['run-one', 4101], ['run-two', 4102]]) {
                const reporter = new BenchmarkSystemReporter({outputFile, runId});

                reporter.onBegin({projects: [project]}, {allTests: () => []});
                reporter.onError({message: launchExit({pid})}, {project})
            }

            const retained = await fs.readJson(outputFile);

            expect(retained.runId).toBe('run-two');
            expect(retained.browserLifecycle.launchExits).toEqual([
                expect.objectContaining({processId: 4102})
            ]);
            expect(JSON.stringify(retained)).not.toContain('4101')
        } finally {
            await fs.remove(root)
        }
    });

    test('#17679 two reporter runs retain distinct launch-exit receipts across artifact cleanup', async () => {
        const root         = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-browser-lifecycle-history-')),
              receiptRoot  = path.join(root, 'receipts'),
              artifactDir  = path.join(root, 'artifacts'),
              project      = {name: 'chromium', use: {browserName: 'chromium', channel: 'chrome', headless: true}},
              receiptFiles = new Map();

        try {
            await fs.ensureDir(artifactDir);
            await fs.writeFile(path.join(artifactDir, 'trace.zip'), 'ephemeral');

            for (const runId of ['run-one', 'run-two']) {
                const receipt  = resolveBrowserLifecycleReceipt({receiptRoot, runId}),
                      reporter = new BenchmarkSystemReporter({...receipt, retentionLimit: 100});

                receiptFiles.set(runId, receipt.outputFile);
                reporter.onBegin({projects: [project]}, {allTests: () => []});
                reporter.onError({message: launchExit({pid: runId === 'run-one' ? 4101 : 4102})}, {project})
            }

            await fs.emptyDir(artifactDir);

            const first  = await fs.readJson(receiptFiles.get('run-one')),
                  second = await fs.readJson(receiptFiles.get('run-two'));

            expect(first).toMatchObject({
                recordType      : BROWSER_LIFECYCLE_RECEIPT_RECORD_TYPE,
                runId           : 'run-one',
                browserLifecycle: {launchExits: [expect.objectContaining({processId: 4101})]}
            });
            expect(second).toMatchObject({
                recordType      : BROWSER_LIFECYCLE_RECEIPT_RECORD_TYPE,
                runId           : 'run-two',
                browserLifecycle: {launchExits: [expect.objectContaining({processId: 4102})]}
            });
            const receiptRows = [first, second].flatMap(receipt => (
                      receipt.browserLifecycle.launchExits.map(exit => ({...exit, runId: receipt.runId}))
                  )),
                  nativeReports = receiptRows.map((row, index) => ({
                      capturedAt: new Date(Date.parse(row.capturedAt) + 21 + index * 18).toISOString(),
                      processId : row.processId
                  })),
                  joinedRunIds = nativeReports.map(nativeReport => receiptRows.find(row => (
                      row.processId === nativeReport.processId &&
                      Math.abs(Date.parse(nativeReport.capturedAt) - Date.parse(row.capturedAt)) <= 57
                  ))?.runId);

            expect(joinedRunIds).toEqual(['run-one', 'run-two']);
            expect(await fs.readdir(artifactDir)).toEqual([]);
        } finally {
            await fs.remove(root)
        }
    });

    test('#17679 retention prunes only old reporter-owned regular files', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-browser-lifecycle-prune-'));

        try {
            const ownedFiles = new Map();

            for (const [runId, mtime] of [['run-one', 1000], ['run-two', 2000], ['run-three', 3000]]) {
                const file = resolveBrowserLifecycleReceipt({receiptRoot: root, runId}).outputFile;

                ownedFiles.set(runId, file);
                await fs.writeJson(file, {recordType: BROWSER_LIFECYCLE_RECEIPT_RECORD_TYPE, runId});
                await fs.utimes(file, mtime / 1000, mtime / 1000)
            }

            const foreignFile    = path.join(root, `receipt-${'e'.repeat(64)}.json`),
                  mismatchedFile = path.join(root, `receipt-${'d'.repeat(64)}.json`),
                  malformedFile  = path.join(root, `receipt-${'c'.repeat(64)}.json`),
                  linkedFile     = path.join(root, `receipt-${'b'.repeat(64)}.json`);

            await fs.writeJson(foreignFile, {recordType: 'another-owner'});
            await fs.writeJson(mismatchedFile, {
                recordType: BROWSER_LIFECYCLE_RECEIPT_RECORD_TYPE,
                runId     : 'not-owned-at-this-path'
            });
            await fs.writeFile(malformedFile, '{broken');
            await fs.symlink(ownedFiles.get('run-three'), linkedFile);

            expect(await pruneBrowserLifecycleReceipts(root, {limit: 2})).toEqual({
                retained: 2,
                removed : [path.basename(ownedFiles.get('run-one'))]
            });
            expect(await fs.pathExists(ownedFiles.get('run-one'))).toBe(false);

            for (const file of [
                ownedFiles.get('run-two'),
                ownedFiles.get('run-three'),
                foreignFile,
                mismatchedFile,
                malformedFile,
                linkedFile
            ]) {
                expect(await fs.pathExists(file), `${path.basename(file)} survives`).toBe(true)
            }
        } finally {
            await fs.remove(root)
        }
    });

    test('#16161 deduplicates reporter paths and persists no raw launch command', async () => {
        const
            directory            = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-browser-lifecycle-')),
            outputFile           = path.join(directory, 'benchmark-system-info.json'),
            reporter             = new BenchmarkSystemReporter({outputFile}),
            project              = {name: 'chromium', use: {browserName: 'chromium', channel: 'chrome', headless: true}},
            terminal             = [],
            originalConsoleError = console.error,
            error                = {
                message: [
                    launchExit(),
                    '<launching> /Applications/Google Chrome.app --headless --user-data-dir=/private/profile',
                    'https://private.example.test secret-window-title'
                ].join('\n')
            };

        try {
            console.error = (...args) => terminal.push(args.join(' '));

            reporter.onBegin(
                {projects: [project]},
                {allTests: () => [{id: 'launch-test'}]}
            );
            reporter.onError(error, {project, workerIndex: 3});
            reporter.onTestEnd(
                {id: 'launch-test', parent: {project: () => project}},
                {errors: [error], retry: 1, workerIndex: 3}
            );

            const
                receipt = await fs.readJson(outputFile),
                exits   = receipt.browserLifecycle.launchExits,
                raw     = JSON.stringify(exits);

            expect(exits).toHaveLength(1);
            expect(exits[0]).toMatchObject({
                project       : 'chromium',
                channel       : 'chrome',
                browserKind   : 'branded-chrome',
                launchMode    : 'headless',
                profile       : 'presenting',
                processId     : 4242,
                cause         : 'unclassified-process-exit',
                remedy        : 'inspect-retained-launch-exit',
                observedVia   : ['reporter-error', 'test-result'],
                transportState: 'not-observable'
            });
            expect(terminal).toHaveLength(1);
            expect(terminal[0]).toContain('channel=chrome browserKind=branded-chrome launchMode=headless');
            expect(terminal[0]).toContain('failure=before-browser-object cause=unclassified-process-exit');
            expect(terminal[0]).toContain('remedy=inspect-retained-launch-exit');
            expect(raw).not.toContain('<launching>');
            expect(raw).not.toContain('/Applications/Google Chrome.app');
            expect(raw).not.toContain('--headless');
            expect(raw).not.toContain('user-data-dir');
            expect(raw).not.toContain('/private/profile');
            expect(raw).not.toContain('private.example.test');
            expect(raw).not.toContain('secret-window-title');
            expect(raw).not.toContain('browserType.launch');
            expect(raw).not.toContain('Failed to launch the browser process')
        } finally {
            console.error = originalConsoleError;
            await fs.remove(directory)
        }
    })
});
