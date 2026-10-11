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
 * @summary Loads `src/Main.mjs` in a stubbed main-thread context whose `window.open` returns one fake
 * popup with the given geometry, opens a window through `Main#windowOpen`, and reports every
 * `resizeTo` call the popup received.
 *
 * The geometry is what the opener can read synchronously after `window.open()`: an unemulated
 * Chrome answers `outerWidth`/`outerHeight` 0 for a popup that has no frame yet, an emulated page
 * answers the requested extent at once.
 * @param {Object} geometry `{innerWidth, innerHeight, outerWidth, outerHeight}`
 * @param {String} windowFeatures
 * @returns {Promise<{opened: Boolean, resizes: Number[][]}>}
 */
async function openWith(geometry, windowFeatures) {
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

        const resizes = [];

        globalThis.open = () => ({
            ...${JSON.stringify(geometry)},
            closed        : false,
            document      : {createElement: () => ({}), head: {append() {}}},
            location      : {replace() {}},
            sessionStorage: {removeItem() {}, setItem() {}},
            close() {},
            resizeTo(width, height) {resizes.push([width, height])}
        });

        const {default: Main} = await import('${REPO_ROOT}/src/Main.mjs');

        const opened = Main.windowOpen({
            url           : './index.html?popout=metrics',
            windowFeatures: ${JSON.stringify(windowFeatures)},
            windowName    : 'tearout-metrics'
        });

        console.log('PROBE ' + JSON.stringify({opened, resizes}));
        process.exit(0)
    `;

    const {stdout} = await execFileAsync(process.execPath, ['--input-type=module', '-e', script], {cwd: REPO_ROOT});

    return JSON.parse(stdout.split('\n').find(line => line.startsWith('PROBE ')).substring(6))
}

/**
 * @summary `Main#windowOpen` makes the requested height the popup's total height. The request is
 * the authority for that resize: a newborn popup has no frame to read yet, and on an unemulated
 * Chrome its outer geometry answers 0 until it is laid out, so a resize built from that reading
 * lands on the platform's minimum width instead of the request.
 */
test.describe('Neo.Main#windowOpen — the requested size is the popup\'s total size', () => {
    test('a newborn popup that reports no frame yet is resized to the request, not to its unlaid geometry', async () => {
        const result = await openWith(
            {innerHeight: 239, innerWidth: 320, outerHeight: 0, outerWidth: 0},
            'height=240,left=3956,top=687,width=320'
        );

        expect(result.opened).toBe(true);
        expect(result.resizes).toEqual([[320, 240]])
    });

    test('a popup whose frame is readable at once gets the same total size', async () => {
        const result = await openWith(
            {innerHeight: 240, innerWidth: 320, outerHeight: 306, outerWidth: 320},
            'height=240,left=3956,top=687,width=320'
        );

        expect(result.resizes).toEqual([[320, 240]])
    });

    test('a request that names no size leaves the popup as the platform made it', async () => {
        const result = await openWith(
            {innerHeight: 239, innerWidth: 320, outerHeight: 0, outerWidth: 0},
            'left=3956,top=687'
        );

        expect(result.opened).toBe(true);
        expect(result.resizes).toEqual([])
    })
});
