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

/**
 * @summary Hands `Neo.Main` an addon whose async init outlasts any fixed delay, and reports whether that
 * init had finished when `importAddon` resolved.
 *
 * An addon that loads external files — Monaco, Mermaid, AmCharts — resolves `initAsync` only once the
 * browser has fetched and parsed them, which is exactly the case a 20 ms sleep cannot cover. The caller
 * is an app worker that will use the addon's remote proxy the moment this promise settles.
 * @param {Number} delay how long the addon's `initAsync` takes, in ms
 * @returns {Promise<{initFinished: Boolean}>}
 */
async function importSlowAddon(delay) {
    const script = `
        import Neo from '${REPO_ROOT}/src/Neo.mjs';
        import * as core from '${REPO_ROOT}/src/core/_export.mjs';
        import {setup} from '${REPO_ROOT}/test/playwright/setup.mjs';

        setup({mockMain: false, neoConfig: {unitTestMode: true}});

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

        const {default: Main} = await import('${REPO_ROOT}/src/Main.mjs');

        let initFinished = false;

        class SlowAddon extends Neo.core.Base {
            static config = {className: 'Neo.main.addon.SlowProbe'}

            async initAsync() {
                await new Promise(resolve => setTimeout(resolve, ${delay}));
                initFinished = true;
                await super.initAsync()
            }
        }

        Neo.setupClass(SlowAddon);

        // onDomContentLoaded never fires in this stub, so its registry has to exist before an addon lands in it
        Main.addon             = {};
        Main.importAddonModule = async () => ({default: SlowAddon});

        await Main.importAddon({name: 'SlowProbe'});

        console.log('PROBE ' + JSON.stringify({initFinished}))
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
    });

    test('importAddon resolves only after the addon it created has finished its async init', async () => {
        // 60 ms outlasts the 20 ms sleep this replaced, so the two states are distinguishable
        expect((await importSlowAddon(60)).initFinished, 'a slow addon is registered before the caller continues').toBe(true);

        // The control: an addon that needs no time at all reports the same, so the arm above is not reading a delay
        expect((await importSlowAddon(0)).initFinished, 'and so is an instant one').toBe(true)
    })
});
