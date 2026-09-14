import {test, expect}  from '@playwright/test';
import {execFile}      from 'child_process';
import fs              from 'fs';
import os              from 'os';
import path            from 'path';
import {promisify}     from 'util';
import {fileURLToPath} from 'url';

const
    __dirname     = path.dirname(fileURLToPath(import.meta.url)),
    REPO_ROOT     = path.resolve(__dirname, '../../../..'),
    ADDON         = 'NoSuchWorkspaceAddon',
    execFileAsync = promisify(execFile);

/**
 * @summary Loads `src/Main.mjs` in a stubbed main-thread context, asks it for one addon under one
 * environment, and reports where the import resolved.
 *
 * No such addon exists, so the failed import names the absolute path it tried. That keeps the
 * assertion on the specifier itself instead of on whichever file happens to sit at a path.
 * @param {String} environment
 * @param {String} name
 * @param {String} [engine=REPO_ROOT] the directory the engine is loaded from; symlinks in it are preserved
 * @returns {Promise<{code: String, message: String}>}
 */
async function resolveAddon(environment, name, engine=REPO_ROOT) {
    const script = `
        import Neo from '${engine}/src/Neo.mjs';
        import * as core from '${engine}/src/core/_export.mjs';
        import {setup} from '${engine}/test/playwright/setup.mjs';

        setup({mockMain: false, neoConfig: {unitTestMode: true}});
        Neo.config.environment = '${environment}';

        globalThis.document = {
            readyState         : 'loading',
            hidden             : false,
            visibilityState    : 'visible',
            addEventListener   : () => {},
            removeEventListener: () => {},
            getElementById     : () => null,
            querySelector      : () => null,
            createElement      : () => ({addEventListener: () => {}, classList: {add: () => {}, remove: () => {}}}),
            body               : {addEventListener: () => {}, classList: {add: () => {}, remove: () => {}}},
            documentElement    : {classList: {add: () => {}, remove: () => {}}}
        };
        globalThis.window              = globalThis;
        globalThis.addEventListener    = () => {};
        globalThis.removeEventListener = () => {};
        globalThis.location            = {};
        globalThis.screen              = {orientation: {}};
        globalThis.matchMedia          = () => ({matches: false, addEventListener: () => {}, removeEventListener: () => {}});
        globalThis.Worker              = class {};
        globalThis.SharedWorker        = class {};

        Neo.insideWorker = true;
        delete Neo.main.DomAccess;
        delete Neo.worker.Manager;

        const {default: Main} = await import('${engine}/src/Main.mjs');

        try {
            await Main.importAddon({name: '${name}'});
            console.log('PROBE ' + JSON.stringify({code: null, message: 'imported'}))
        } catch (error) {
            console.log('PROBE ' + JSON.stringify({code: error.code, message: error.message}))
        }
    `;

    const {stdout} = await execFileAsync(process.execPath, ['--preserve-symlinks', '--input-type=module', '-e', script], {cwd: REPO_ROOT});

    return JSON.parse(stdout.split('\n').find(line => line.startsWith('PROBE ')).substring(6))
}

test.describe('Neo.Main addon resolution', () => {
    test('dist/esm resolves a WS/ addon inside its own tree, where the build emitted it beside the engine addons', async () => {
        const {code, message} = await resolveAddon('dist/esm', `WS/${ADDON}`);

        expect(code).toBe('ERR_MODULE_NOT_FOUND');
        expect(message).toContain(path.join(REPO_ROOT, 'src/main/addon', `${ADDON}.mjs`))
    });

    test('development resolves a WS/ addon from the workspace root, three levels above the engine source', async () => {
        const {code, message} = await resolveAddon('development', `WS/${ADDON}`);

        expect(code).toBe('ERR_MODULE_NOT_FOUND');
        expect(message).toContain(path.resolve(REPO_ROOT, '../../src/main/addon', `${ADDON}.mjs`))
    });

    test('dist/esm keeps a WS/ addon at the workspace root while the engine runs from its installed package', async () => {
        const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'neo-ws-addon-'))),
              engine    = path.join(workspace, 'node_modules/neo.mjs');

        fs.mkdirSync(path.dirname(engine));
        fs.symlinkSync(REPO_ROOT, engine, 'dir');

        try {
            const {code, message} = await resolveAddon('dist/esm', `WS/${ADDON}`, engine);

            expect(code).toBe('ERR_MODULE_NOT_FOUND');
            expect(message).toContain(path.join(workspace, 'src/main/addon', `${ADDON}.mjs`))
        } finally {
            fs.rmSync(workspace, {recursive: true, force: true})
        }
    });

    test('an engine addon resolves beside Main in both environments', async () => {
        for (const environment of ['development', 'dist/esm']) {
            const {message} = await resolveAddon(environment, ADDON);

            expect(message, environment).toContain(path.join(REPO_ROOT, 'src/main/addon', `${ADDON}.mjs`))
        }
    })
});
