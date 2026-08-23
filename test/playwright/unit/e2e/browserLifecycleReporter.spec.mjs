import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';
import {expect, test} from '@playwright/test';
import BenchmarkSystemReporter, {
    classifyBrowserLaunchExit,
    readOptionalSystemFact,
    resolveBrowserKind,
    resolveE2eProfileName
} from '../../e2e/custom-reporter.js';

const launchExit = ({
    exitCode = 'null',
    pid = 4242,
    prefix = 'Error: browserType.launch: Failed to launch the browser process.',
    signal = 'SIGABRT'
} = {}) => [
    prefix,
    'Browser logs:',
    '',
    `<launched> pid=${pid}`,
    `[pid=${pid}] <process did exit: exitCode=${exitCode}, signal=${signal}>`
].join('\n');

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
                    '<launching> /Applications/Google Chrome.app --user-data-dir=/private/profile',
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
            expect(raw).not.toContain('user-data-dir');
            expect(raw).not.toContain('private.example.test');
            expect(raw).not.toContain('secret-window-title')
        } finally {
            console.error = originalConsoleError;
            await fs.remove(directory)
        }
    })
});
