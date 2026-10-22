import {test, expect}  from '@playwright/test';
import {execFile}      from 'child_process';
import path            from 'path';
import {promisify}     from 'util';
import {fileURLToPath} from 'url';

const
    __dirname     = path.dirname(fileURLToPath(import.meta.url)),
    REPO_ROOT     = path.resolve(__dirname, '../../../..'),
    execFileAsync = promisify(execFile);

/**
 * @summary Loads `src/Main.mjs` in a stubbed main-thread context and moves `tearout-audit` through
 * `Main#windowMoveTo`, reporting where the move went.
 *
 * `ownHandle` gives this window the popup's handle, as if it had opened it. `opener` gives it an opener
 * whose Main records the moves it is asked for, as the main window does for a popup.
 * @param {Object}  scenario
 * @param {Boolean} scenario.opener
 * @param {Boolean} scenario.ownHandle
 * @returns {Promise<{delegated: Object[], moved: Number[][], result: Boolean}>}
 */
async function moveWith({opener, ownHandle}) {
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
        globalThis.location            = {href: 'http://localhost:8080/apps/workstation/index.html', origin: 'http://localhost:8080'};
        globalThis.screen              = {orientation: {}};
        globalThis.matchMedia          = () => ({matches: false, addEventListener: () => {}, removeEventListener: () => {}});
        globalThis.Worker              = class {};
        globalThis.SharedWorker        = class {};

        Neo.insideWorker = true;
        delete Neo.main.DomAccess;
        delete Neo.worker.Manager;

        const delegated = [], moved = [];

        if (${opener}) {
            globalThis.opener = {Neo: {Main: {windowMoveTo: async data => {delegated.push(data); return true}}}}
        }

        const {default: Main} = await import('${REPO_ROOT}/src/Main.mjs');

        if (${ownHandle}) {
            Main.openWindows['tearout-audit'] = {win: {
                closed : false,
                screenX: 0,
                screenY: 0,
                moveTo(x, y) {moved.push([x, y]); this.screenX = x; this.screenY = y}
            }}
        }

        const result = await Main.windowMoveTo({windowName: 'tearout-audit', x: 400, y: 300});

        console.log('PROBE ' + JSON.stringify({delegated, moved, result}));
        process.exit(0)
    `;

    const {stdout} = await execFileAsync(process.execPath, ['--input-type=module', '-e', script], {cwd: REPO_ROOT});

    return JSON.parse(stdout.split('\n').find(line => line.startsWith('PROBE ')).substring(6))
}

/**
 * @summary `Main#windowMoveTo` moves a popup through the handle of the window that opened it. A drag that
 * runs in a popup moves a vessel the main window opened, so the popup's own Main holds no handle for it.
 */
test.describe('Neo.Main#windowMoveTo — a window without the handle asks its opener', () => {
    test('a popup that holds no handle by that name forwards the move to its opener', async () => {
        const result = await moveWith({opener: true, ownHandle: false});

        expect(result.delegated).toEqual([{windowName: 'tearout-audit', x: 400, y: 300}]);
        expect(result.result).toBe(true)
    });

    test('a window holding the handle moves the popup itself', async () => {
        const result = await moveWith({opener: true, ownHandle: true});

        expect(result.moved).toEqual([[400, 300]]);
        expect(result.delegated).toEqual([]);
        expect(result.result).toBe(true)
    });

    test('a window with neither a handle nor an opener moves nothing', async () => {
        const result = await moveWith({opener: false, ownHandle: false});

        expect(result.delegated).toEqual([]);
        expect(result.result).toBe(false)
    })
});
