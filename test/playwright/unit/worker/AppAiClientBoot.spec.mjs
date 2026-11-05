import {test, expect}  from '@playwright/test';
import {execFile}      from 'node:child_process';
import path            from 'node:path';
import {promisify}     from 'node:util';
import {fileURLToPath} from 'node:url';

const
    root    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'),
    execute = promisify(execFile);

const cases = {
    off                : {useAiClient: false, environment: 'development'},
    true               : {useAiClient: true, environment: 'development'},
    arrayIncludes      : {useAiClient: ['development', 'dist/production'], environment: 'development'},
    arrayExcludes      : {useAiClient: ['dist/production'], environment: 'development'},
    stringMatches      : {useAiClient: 'development', environment: 'development'},
    stringDiffers      : {useAiClient: 'dist/production', environment: 'development'},
    githubPages        : {useAiClient: true, environment: 'development', isGitHubPages: true},
    testFlag           : {useAiClient: false, environment: 'development', allowAiClientInTests: true},
    testFlagOverTrue   : {useAiClient: true, environment: 'development', allowAiClientInTests: true},
    testFlagGithubPages: {allowAiClientInTests: true, environment: 'development', isGitHubPages: true}
};

/**
 * @summary Runs the App worker's boot decision in a fresh Node process. The App class is imported without its
 * singleton startup, the way the worker-registration specs do, so no worker boots.
 * @returns {Promise<Object>} Each case's resolved boot
 */
async function bootProbe() {
    const script = `
        import Neo from './src/Neo.mjs';
        import * as core from './src/core/_export.mjs';
        import {setup} from './test/playwright/setup.mjs';

        setup({mockMain: false, neoConfig: {unitTestMode: true}});

        delete Neo.worker.App;
        Neo.overwrites = {Neo: {worker: {App: {singleton: false}}}};

        const {default: App} = await import('./src/worker/App.mjs'),
              cases          = ${JSON.stringify(cases)};

        console.log(JSON.stringify(Object.fromEntries(Object.entries(cases).map(([name, config]) =>
            [name, App.prototype.resolveAiClientBoot(config)]))));
    `;

    const {stdout} = await execute(process.execPath, ['--input-type=module', '-e', script], {
        cwd: root, encoding: 'utf8', timeout: 15000
    });

    return JSON.parse(stdout.trim().split('\n').at(-1))
}

/** @summary Pins how the App worker decides to host the Neural Link client. */
test.describe('Neo.worker.App#resolveAiClientBoot', () => {
    let boot;

    test.beforeAll(async () => {boot = await bootProbe()});

    test('useAiClient keeps its three forms, and each connects', () => {
        expect(boot.true).toBe('transport');
        expect(boot.arrayIncludes).toBe('transport');
        expect(boot.stringMatches).toBe('transport')
    });

    test('a false or non-matching useAiClient loads no client', () => {
        expect(boot.off).toBeNull();
        expect(boot.arrayExcludes).toBeNull();
        expect(boot.stringDiffers).toBeNull()
    });

    test('allowAiClientInTests boots the registry without transport, whatever useAiClient says', () => {
        expect(boot.testFlag).toBe('registry');
        expect(boot.testFlagOverTrue).toBe('registry')
    });

    test('GitHub Pages loads no client, test flag or not', () => {
        expect(boot.githubPages).toBeNull();
        expect(boot.testFlagGithubPages).toBeNull()
    })
});
