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
 * @summary Loads `src/Main.mjs` in a stubbed main-thread context, registers one fake popup with the
 * given chrome (outer minus inner extents), moves it through `Main#windowMoveTo`, and reports the
 * frame origin the popup received and whether the move was admitted.
 * @param {Object} geometry `{innerWidth, innerHeight, outerWidth, outerHeight}`
 * @param {Object} move `{x, y, contentOrigin}`
 * @returns {Promise<{admitted: Boolean, moves: Number[][]}>}
 */
async function moveWith(geometry, move) {
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

        const moves = [];

        const popup = {
            ...${JSON.stringify(geometry)},
            closed : false,
            screenX: 0,
            screenY: 0,
            moveTo(x, y) {
                moves.push([x, y]);
                // the platform lands the frame where it was asked, so the verification sees it at once
                this.screenX = x;
                this.screenY = y
            }
        };

        const {default: Main} = await import('${REPO_ROOT}/src/Main.mjs');

        Main.openWindows['tearout-metrics'] = {win: popup};

        const admitted = await Main.windowMoveTo({windowName: 'tearout-metrics', ...${JSON.stringify(move)}});

        console.log('PROBE ' + JSON.stringify({admitted, moves}));
        process.exit(0)
    `;

    const {stdout} = await execFileAsync(process.execPath, ['--input-type=module', '-e', script], {cwd: REPO_ROOT});

    return JSON.parse(stdout.split('\n').find(line => line.startsWith('PROBE ')).substring(6))
}

/**
 * @summary `Main#windowMoveTo` moves the frame; with `contentOrigin` the caller names where the
 * popup's content must land, and the frame goes one chrome height above it. A pointer-follow drag
 * measured its grab offset inside the dragged element, so it names the content: under viewport
 * emulation a popup carries no chrome and both readings coincide, on a real window they differ by
 * the title bar.
 */
test.describe('Neo.Main#windowMoveTo — the content origin versus the frame origin', () => {
    const realWindow = {innerHeight: 173, innerWidth: 320, outerHeight: 240, outerWidth: 320};

    test('a content-origin move lands the frame one title bar above the requested point on a real window', async () => {
        const result = await moveWith(realWindow, {x: 100, y: 200, contentOrigin: true});

        expect(result.moves).toEqual([[100, 133]]);
        expect(result.admitted).toBe(true)
    });

    test('a frame move is unchanged', async () => {
        const result = await moveWith(realWindow, {x: 100, y: 200});

        expect(result.moves).toEqual([[100, 200]]);
        expect(result.admitted).toBe(true)
    });

    test('under emulation, where a popup carries no chrome, both readings coincide', async () => {
        const result = await moveWith({innerHeight: 240, innerWidth: 320, outerHeight: 240, outerWidth: 320}, {x: 100, y: 200, contentOrigin: true});

        expect(result.moves).toEqual([[100, 200]])
    })
});
