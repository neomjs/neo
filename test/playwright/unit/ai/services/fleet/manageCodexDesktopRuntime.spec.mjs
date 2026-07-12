import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';
import {
    classifyCodexDesktopCrashpadProcesses,
    cleanupCodexDesktopCrashpad,
    inspectCodexDesktopCrashpadProcesses,
    probeCodexDesktopCapabilities
} from '../../../../../../ai/services/fleet/manageCodexDesktopRuntime.mjs';

const REQUIRED_ASAR_MARKERS = [
    'CODEX_ELECTRON_USER_DATA_PATH',
    '--open-project',
    'CODEX_SPARKLE_ENABLED',
    'CODEX_SPARKLE_ENABLED===`false`',
    'shouldIncludeSparkle',
    'enableUpdater'
].join('\n');

function makeBundle({asar = REQUIRED_ASAR_MARKERS, framework = 'user-data-dir'} = {}) {
    const
        appBundle     = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-desktop-probe-')),
        contents      = path.join(appBundle, 'Contents'),
        main          = path.join(contents, 'MacOS', 'ChatGPT'),
        appAsar       = path.join(contents, 'Resources', 'app.asar'),
        frameworkDir  = path.join(contents, 'Frameworks', 'Codex Framework.framework'),
        frameworkPath = path.join(frameworkDir, 'Codex Framework'),
        crashpad      = path.join(frameworkDir, 'Helpers', 'browser_crashpad_handler');

    for (const directory of [path.dirname(main), path.dirname(appAsar), path.dirname(crashpad)]) {
        fs.mkdirSync(directory, {recursive: true});
    }

    fs.writeFileSync(main, '#!/bin/sh\n', {mode: 0o755});
    fs.writeFileSync(appAsar, asar);
    fs.writeFileSync(frameworkPath, framework);
    fs.writeFileSync(crashpad, '#!/bin/sh\n', {mode: 0o755});

    return {appBundle, main, crashpad};
}

test.describe('manageCodexDesktopRuntime', () => {
    const roots = [];

    test.afterEach(() => {
        for (const root of roots.splice(0)) fs.rmSync(root, {recursive: true, force: true});
    });

    test('capability probe proves the packaged profile/project/updater tuple without a version allowlist', () => {
        const fixture = makeBundle();
        roots.push(fixture.appBundle);

        expect(probeCodexDesktopCapabilities({binaryPath: fixture.main})).toEqual({
            available         : true,
            reason            : null,
            binaryPath        : fs.realpathSync(fixture.main),
            crashpadExecutable: fs.realpathSync(fixture.crashpad),
            appBundle         : fs.realpathSync(fixture.appBundle)
        });
    });

    test('capability probe fails closed when updater env presence lacks the falsifiable false predicate', () => {
        const fixture = makeBundle({
            asar: REQUIRED_ASAR_MARKERS.replace('CODEX_SPARKLE_ENABLED===`false`', 'CODEX_SPARKLE_ENABLED')
        });
        roots.push(fixture.appBundle);

        expect(probeCodexDesktopCapabilities({binaryPath: fixture.main})).toMatchObject({
            available: false,
            reason   : 'updater-disable-predicate-missing'
        });
    });

    test('capability probe names every missing project/profile contract before any launch', () => {
        const scenarios = [{
            bundle: {asar: REQUIRED_ASAR_MARKERS.replace('--open-project', '')},
            reason: 'app-contract-marker-missing:--open-project'
        }, {
            bundle: {asar: REQUIRED_ASAR_MARKERS.replace('CODEX_ELECTRON_USER_DATA_PATH', '')},
            reason: 'app-contract-marker-missing:CODEX_ELECTRON_USER_DATA_PATH'
        }, {
            bundle: {framework: ''},
            reason: 'chromium-contract-marker-missing:user-data-dir'
        }];

        for (const scenario of scenarios) {
            const fixture = makeBundle(scenario.bundle);
            roots.push(fixture.appBundle);

            expect(probeCodexDesktopCapabilities({binaryPath: fixture.main})).toMatchObject({
                available: false,
                reason   : scenario.reason
            });
        }
    });

    test('capability probe rejects a standalone executable that is not an app-bundle main', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-desktop-standalone-')),
              bin  = path.join(root, 'ChatGPT');
        roots.push(root);
        fs.writeFileSync(bin, '#!/bin/sh\n', {mode: 0o755});

        expect(probeCodexDesktopCapabilities({binaryPath: bin})).toMatchObject({
            available: false,
            reason   : 'binary-is-not-an-app-bundle-main'
        });
    });

    test('classifier owns only exact executable + contained database and leaves foreign profiles untouched', () => {
        const
            profile = '/srv/fleet/peer/codex-desktop/electron-profile',
            helper  = '/Applications/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/browser_crashpad_handler',
            result  = classifyCodexDesktopCrashpadProcesses({
                electronProfile   : profile,
                crashpadExecutable: helper,
                processes         : [{
                    pid         : 11,
                    executable  : helper,
                    processToken: 'birth-11',
                    command     : `${helper} --monitor-self --database=${profile}/Crashpad --annotation=prod=Codex`
                }, {
                    pid       : 12,
                    executable: helper,
                    command   : `${helper} --database=/Users/operator/Library/Application Support/Codex/Crashpad --annotation=prod=Codex`
                }, {
                    pid       : 13,
                    executable: helper,
                    command   : `${helper} --database=${profile}-foreign/Crashpad --annotation=prod=Codex`
                }]
            });

        expect(result.owned.map(row => row.pid)).toEqual([11]);
        expect(result.foreign.map(row => row.pid)).toEqual([12, 13]);
        expect(result.ambiguous).toEqual([]);
    });

    test('classifier treats profile-matching rows with missing or foreign executable proof as ambiguous', () => {
        const
            profile = '/srv/fleet/peer/electron-profile',
            helper  = '/Applications/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Helpers/browser_crashpad_handler',
            command = `${helper} --database=${profile}/Crashpad --annotation=prod=Codex`,
            result  = classifyCodexDesktopCrashpadProcesses({
                electronProfile   : profile,
                crashpadExecutable: helper,
                processes         : [
                    {pid: 21, command, executable: null},
                    {pid: 22, command, executable: '/tmp/foreign/browser_crashpad_handler'},
                    {pid: 23, command, executable: helper, processToken: null}
                ]
            });

        expect(result.owned).toEqual([]);
        expect(result.ambiguous.map(row => row.reason)).toEqual([
            'executable-identity-unavailable',
            'profile-match-with-foreign-executable',
            'process-birth-token-unavailable'
        ]);
    });

    test('classifier fails closed when exact-helper database ownership is absent or unparseable', () => {
        const
            profile = '/srv/fleet/peer/electron-profile',
            helper  = '/Applications/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Helpers/browser_crashpad_handler',
            result  = classifyCodexDesktopCrashpadProcesses({
                electronProfile   : profile,
                crashpadExecutable: helper,
                processes         : [{pid: 24, command: `${helper} --monitor-self`, executable: helper}]
            });

        expect(result.owned).toEqual([]);
        expect(result.ambiguous).toMatchObject([{pid: 24, reason: 'database-identity-unavailable'}]);
    });

    test('classifier accepts the alternate spaced database argv form without losing paths with spaces', () => {
        const
            profile = '/srv/fleet/Peer With Spaces/electron-profile',
            helper  = '/Applications/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Helpers/browser_crashpad_handler',
            result  = classifyCodexDesktopCrashpadProcesses({
                electronProfile   : profile,
                crashpadExecutable: helper,
                processes         : [{pid: 25, command: `${helper} --database ${profile}/Crashpad --annotation=prod=Codex`, executable: helper, processToken: 'birth-25'}]
            });

        expect(result.owned).toMatchObject([{pid: 25, database: `${profile}/Crashpad`}]);
        expect(result.ambiguous).toEqual([]);
    });

    test('classifier refuses kill authority when one argv carries multiple database roots', () => {
        const
            profile = '/srv/fleet/peer/electron-profile',
            helper  = '/Applications/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Helpers/browser_crashpad_handler',
            result  = classifyCodexDesktopCrashpadProcesses({
                electronProfile   : profile,
                crashpadExecutable: helper,
                processes         : [{
                    pid       : 23,
                    executable: helper,
                    command   : `${helper} --database=${profile}/Crashpad --database=/tmp/foreign --annotation=prod=Codex`
                }]
            });

        expect(result.owned).toEqual([]);
        expect(result.ambiguous).toMatchObject([{pid: 23, reason: 'multiple-profile-database-arguments'}]);
    });

    test('host inspector combines pgrep argv with lsof loaded-executable identity', () => {
        const
            profile      = '/srv/fleet/Peer With Spaces/electron-profile',
            helper       = '/Applications/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Helpers/browser_crashpad_handler',
            execFileImpl = (command, args) => command === 'pgrep'
                ? `31 ${helper} --database=${profile}/Crashpad --annotation=prod=Codex\n`
                : command === 'ps'
                    ? 'Sun Jul 12 04:00:00 2026\n'
                    : `p${args[2]}\nftxt\nn${helper}\nftxt\nn/usr/lib/dyld\n`,
            result = inspectCodexDesktopCrashpadProcesses({electronProfile: profile, crashpadExecutable: helper, execFileImpl});

        expect(result.owned.map(row => row.pid)).toEqual([31]);
        expect(result.ambiguous).toEqual([]);
    });

    test('cleanup re-proves ownership, escalates surviving owned helpers, and requires zero residuals', async () => {
        const
            owned   = pid => ({pid, processToken: `birth-${pid}`}),
            alive   = new Map([[41, owned(41)], [42, owned(42)]]),
            signals = [];

        const result = await cleanupCodexDesktopCrashpad({
            electronProfile   : '/srv/fleet/peer/electron-profile',
            crashpadExecutable: '/app/browser_crashpad_handler',
            inspect           : () => ({owned: [...alive.values()], foreign: [], ambiguous: []}),
            killProcess       : (pid, signal) => {
                signals.push([pid, signal]);
                if (pid === 41 || signal === 'SIGKILL') alive.delete(pid);
            },
            wait              : async () => {}
        });

        expect(signals).toEqual([[41, 'SIGTERM'], [42, 'SIGTERM'], [42, 'SIGKILL']]);
        expect(result).toEqual({terminated: [41, 42], escalated: [42]});
    });

    test('cleanup sends no signal when profile ownership is ambiguous', async () => {
        const signals = [];

        await expect(cleanupCodexDesktopCrashpad({
            electronProfile   : '/srv/fleet/peer/electron-profile',
            crashpadExecutable: '/app/browser_crashpad_handler',
            inspect           : () => ({owned: [], foreign: [], ambiguous: [{pid: 51}]}),
            killProcess       : (...args) => signals.push(args),
            wait              : async () => {}
        })).rejects.toThrow(/ambiguous profile-owned process identity/);

        expect(signals).toEqual([]);
    });

    test('cleanup fails when an exact-profile helper survives SIGKILL', async () => {
        const
            owned = {pid: 61, processToken: 'birth-61'};

        await expect(cleanupCodexDesktopCrashpad({
            electronProfile   : '/srv/fleet/peer/electron-profile',
            crashpadExecutable: '/app/browser_crashpad_handler',
            inspect           : () => ({owned: [owned], foreign: [], ambiguous: []}),
            killProcess       : () => {},
            wait              : async () => {}
        })).rejects.toThrow(/survived SIGKILL/);
    });

    test('cleanup refuses a reused pid whose birth token changes before signal', async () => {
        let   inspection = 0;
        const signals    = [];

        await expect(cleanupCodexDesktopCrashpad({
            electronProfile   : '/srv/fleet/peer/electron-profile',
            crashpadExecutable: '/app/browser_crashpad_handler',
            inspect           : () => ({
                owned    : [{pid: 71, processToken: inspection++ === 0 ? 'birth-old' : 'birth-reused'}],
                foreign  : [],
                ambiguous: []
            }),
            killProcess: (...args) => signals.push(args),
            wait       : async () => {}
        })).rejects.toThrow(/birth token changed/);

        expect(signals).toEqual([]);
    });
});
