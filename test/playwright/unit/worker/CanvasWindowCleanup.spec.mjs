/**
 * @file test/playwright/unit/worker/CanvasWindowCleanup.spec.mjs
 * @summary Pins window-scoped OffscreenCanvas cleanup across `Neo.worker.Canvas`, `Neo.canvas.Sparkline`,
 * `Neo.canvas.Base`, and `Neo.component.Sparkline` when a popup window departs while its opener keeps rendering.
 */

import {test, expect}  from '@playwright/test';
import {execFile}      from 'child_process';
import path            from 'path';
import {promisify}     from 'util';
import {fileURLToPath} from 'url';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT     = path.resolve(__dirname, '../../../..');
const execFileAsync = promisify(execFile);

/**
 * @summary Executes one hermetic Canvas SharedWorker cleanup scenario in a child process.
 * @param {String} body
 * @returns {Promise<Object>}
 */
async function runCanvasWorkerCase(body) {
    const script = `
        import Neo       from './src/Neo.mjs';
        import * as core from './src/core/_export.mjs';
        import {setup}   from './test/playwright/setup.mjs';

        setup({mockMain: false, neoConfig: {unitTestMode: true}});
        globalThis.postMessage = () => {};
        delete Neo.worker.Canvas;

        const
            {default: canvasWorker} = await import('./src/worker/Canvas.mjs'),
            {default: sparkline}    = await import('./src/canvas/Sparkline.mjs'),
            {default: CanvasBase}   = await import('./src/canvas/Base.mjs'),
            report                  = {};

        class TestSceneRenderer extends CanvasBase {
            static config = {
                className: 'Test.Unit.Worker.CanvasWindowCleanup.SceneRenderer'
            }
        }
        Neo.setupClass(TestSceneRenderer);

        const stopSparklineLoop = () => {
            clearTimeout(sparkline.animationId);
            sparkline.animationId = null
        };

        const makeSurface = label => {
            const ctx = new Proxy({canvas: null}, {
                get(target, key) {
                    return key in target ? target[key] : () => ({addColorStop() {}})
                }
            });
            const surface = {
                getContext: () => ctx,
                height    : 45,
                label,
                width     : 139
            };
            ctx.canvas = surface;
            return surface
        };

        Object.assign(canvasWorker, {
            canvasWindowMap: {},
            isSharedWorker : true,
            map            : {},
            ports          : [],
            promises       : {}
        });
        Neo.currentWorker = canvasWorker;

        ${body}

        stopSparklineLoop();
        canvasWorker.ports.forEach(({port}) => port?.close?.());
        console.log(JSON.stringify(report));
        process.exit(0)
    `;

    const {stdout} = await execFileAsync(process.execPath, ['--input-type=module', '-e', script], {
        cwd     : REPO_ROOT,
        encoding: 'utf8',
        timeout : 15_000
    });

    return JSON.parse(stdout.trim().split('\n').at(-1))
}

test.describe('Neo.worker.Canvas departed-window cleanup', () => {
    test('releasing a departed popup frees popup-only surfaces and stale shared-id bindings while keeping primary canvases live', async () => {
        const report = await runCanvasWorkerCase(`
            const openerShared = makeSurface('opener-shared'),
                  popupShared  = makeSurface('popup-shared'),
                  popupPooled  = makeSurface('popup-pooled');

            // Cycle: shared cell moves into popup, pools an extra cell there, then returns to opener before popup cleanup lands
            canvasWorker.registerCanvas({node: popupShared, nodeId: 'cell-shared', windowId: 'win-popup'});
            sparkline.register({canvasId: 'cell-shared', windowId: 'win-popup'});

            canvasWorker.registerCanvas({node: popupPooled, nodeId: 'cell-pooled', windowId: 'win-popup'});
            sparkline.register({canvasId: 'cell-pooled', windowId: 'win-popup'});

            // Primary window re-adopts the returning shared cell
            canvasWorker.registerCanvas({node: openerShared, nodeId: 'cell-shared', windowId: 'win-opener'});
            sparkline.register({canvasId: 'cell-shared', windowId: 'win-opener'});

            report.beforeRelease = {
                mapKeys     : Object.keys(canvasWorker.map).sort(),
                sharedOwners: Object.keys(canvasWorker.canvasWindowMap['cell-shared']),
                sparklineIds: [...sparkline.items.keys()].sort()
            };

            // App worker relays popup departure
            canvasWorker.onReleaseWindowCanvases({windowId: 'win-popup'});

            report.afterRelease = {
                mapKeys          : Object.keys(canvasWorker.map),
                mapSharedLabel   : canvasWorker.map['cell-shared']?.label ?? null,
                pooledWindowEntry: canvasWorker.canvasWindowMap['cell-pooled'] ?? null,
                sharedOwners     : Object.keys(canvasWorker.canvasWindowMap['cell-shared'] || {}),
                sparklineIds     : [...sparkline.items.keys()],
                sparklineLabel   : sparkline.items.get('cell-shared')?.canvas?.label ?? null,
                sparklineWindow  : sparkline.items.get('cell-shared')?.windowId ?? null
            };

            // Late canvas transfer from the departed popup is ignored
            canvasWorker.registerCanvasDirect({
                componentId: 'cmp-late',
                node       : makeSurface('late-popup'),
                nodeId     : 'cell-late',
                windowId   : 'win-popup'
            });
            report.lateIgnored = !('cell-late' in canvasWorker.map) && !('cell-late' in canvasWorker.canvasWindowMap)
        `);

        expect(report.beforeRelease).toEqual({
            mapKeys     : ['cell-pooled', 'cell-shared'],
            sharedOwners: ['win-popup', 'win-opener'],
            sparklineIds: ['cell-pooled', 'cell-shared']
        });
        expect(report.afterRelease).toEqual({
            mapKeys          : ['cell-shared'],
            mapSharedLabel   : 'opener-shared',
            pooledWindowEntry: null,
            sharedOwners     : ['win-opener'],
            sparklineIds     : ['cell-shared'],
            sparklineLabel   : 'opener-shared',
            sparklineWindow  : 'win-opener'
        });
        expect(report.lateIgnored).toBe(true)
    });

    test('retiring a popup SharedWorker port directly on Neo.worker.Canvas releases its canvases and Base renderers', async () => {
        const report = await runCanvasWorkerCase(`
            const channel    = new MessageChannel(),
                  popupPort  = {appNames: new Set(['Workstation']), id: 'port-popup', port: channel.port1, windowId: 'win-popup'},
                  openerPort = {appNames: new Set(['Workstation']), id: 'port-opener', port: channel.port2, windowId: 'win-opener'},
                  scene      = Neo.create(TestSceneRenderer),
                  popupSurf  = makeSurface('popup-scene');

            canvasWorker.ports.push(openerPort, popupPort);
            canvasWorker.registerCanvas({node: popupSurf, nodeId: 'scene-canvas', windowId: 'win-popup'});
            scene.initGraph({canvasId: 'scene-canvas', windowId: 'win-popup'});

            report.mountedWindow = scene.windowId;
            report.hasContext    = Boolean(scene.context);

            canvasWorker.removePort(popupPort);

            report.afterRemovePort = {
                hasContext     : Boolean(scene.context),
                mapKeys        : Object.keys(canvasWorker.map),
                sceneWindowId  : scene.windowId,
                windowMapKeys  : Object.keys(canvasWorker.canvasWindowMap)
            };

            scene.destroy()
        `);

        expect(report.mountedWindow).toBe('win-popup');
        expect(report.hasContext).toBe(true);
        expect(report.afterRemovePort).toEqual({
            hasContext   : false,
            mapKeys      : [],
            sceneWindowId: null,
            windowMapKeys: []
        })
    })
});
