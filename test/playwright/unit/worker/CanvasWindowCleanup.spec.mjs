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
    });

    test('in-flight OffscreenCanvas transfers orphaned before App#onCanvasRegistered are evicted without disturbing live bindings (#22186)', async () => {
        const script = `
            import Neo       from './src/Neo.mjs';
            import * as core from './src/core/_export.mjs';
            import {setup}   from './test/playwright/setup.mjs';

            setup({mockMain: false, neoConfig: {unitTestMode: true}});
            globalThis.postMessage = () => {};
            delete Neo.worker.App;
            delete Neo.worker.Canvas;

            const
                {default: canvasWorker} = await import('./src/worker/Canvas.mjs'),
                {default: app}          = await import('./src/worker/App.mjs'),
                {default: CanvasCmp}    = await import('./src/component/Canvas.mjs'),
                report                  = {};

            Object.assign(canvasWorker, {
                canvasWindowMap: {},
                isSharedWorker : true,
                map            : {},
                ports          : [],
                promises       : {}
            });
            Neo.worker.Canvas = {
                unregisterCanvas: async data => canvasWorker.unregisterCanvas(data)
            };

            const makeNode = label => ({getContext: () => ({}), height: 45, label, width: 139});

            // 1. Destroyed before canvasRegistered arrived
            canvasWorker.registerCanvas({node: makeNode('destroyed'), nodeId: 'cell-destroyed', windowId: 'win-opener'});
            app.onCanvasRegistered({componentId: 'missing-cmp', nodeId: 'cell-destroyed', windowId: 'win-opener'});

            // 2. Unmounted before canvasRegistered arrived (ScalePane shrink 31 -> 18 while transfer in flight)
            const unmountedCmp = Neo.create({
                module             : CanvasCmp,
                id                 : 'cell-unmounted',
                mounted            : false,
                offscreenRegistered: false,
                windowId           : 'win-opener'
            });
            canvasWorker.registerCanvas({node: makeNode('unmounted'), nodeId: 'cell-unmounted', windowId: 'win-opener'});
            app.onCanvasRegistered({componentId: 'cell-unmounted', nodeId: 'cell-unmounted', windowId: 'win-opener'});

            // 3. Moved to popup before opener's canvasRegistered arrived, while popup callback is parked
            let popupConfirmed = false;
            const movedCmp = Neo.create({
                module             : CanvasCmp,
                id                 : 'cell-moved',
                mounted            : true,
                offscreenRegistered: false,
                windowId           : 'win-popup'
            });
            movedCmp.registerCanvasCallbacks = {
                'cell-moved': () => { popupConfirmed = true }
            };
            canvasWorker.registerCanvas({node: makeNode('stale-opener'), nodeId: 'cell-moved', windowId: 'win-opener'});
            canvasWorker.registerCanvas({node: makeNode('fresh-popup'),  nodeId: 'cell-moved', windowId: 'win-popup'});
            app.onCanvasRegistered({componentId: 'cell-moved', nodeId: 'cell-moved', windowId: 'win-opener'});
            report.popupCallbackSurvivedStalePing = Boolean(movedCmp.registerCanvasCallbacks['cell-moved']) && !popupConfirmed;
            app.onCanvasRegistered({componentId: 'cell-moved', nodeId: 'cell-moved', windowId: 'win-popup'});
            report.popupConfirmedOnMatchingPing   = popupConfirmed;

            // 4. Live offscreenRegistered binding on same (nodeId, windowId) is preserved
            const liveCmp = Neo.create({
                module             : CanvasCmp,
                id                 : 'cell-live',
                mounted            : true,
                offscreenRegistered: true,
                windowId           : 'win-opener'
            });
            canvasWorker.registerCanvas({node: makeNode('live-opener'), nodeId: 'cell-live', windowId: 'win-opener'});
            app.onCanvasRegistered({componentId: 'cell-live', nodeId: 'cell-live', windowId: 'win-opener'});

            report.finalMapKeys    = Object.keys(canvasWorker.map).sort();
            report.movedOwners     = Object.keys(canvasWorker.canvasWindowMap['cell-moved'] || {});
            report.movedMapSurface = canvasWorker.map['cell-moved']?.label ?? null;
            report.liveMapSurface  = canvasWorker.map['cell-live']?.label ?? null;

            unmountedCmp.destroy();
            movedCmp.destroy();
            liveCmp.destroy();
            console.log(JSON.stringify(report));
            process.exit(0)
        `;

        const {stdout} = await execFileAsync(process.execPath, ['--input-type=module', '-e', script], {
            cwd     : REPO_ROOT,
            encoding: 'utf8',
            timeout : 15_000
        });
        const report = JSON.parse(stdout.trim().split('\n').at(-1));

        expect(report).toEqual({
            finalMapKeys                  : ['cell-live', 'cell-moved'],
            liveMapSurface                : 'live-opener',
            movedMapSurface               : 'fresh-popup',
            movedOwners                   : ['win-popup'],
            popupCallbackSurvivedStalePing: true,
            popupConfirmedOnMatchingPing  : true
        })
    });

    test('delayed orphan cleanup and stale acknowledgements cannot evict or prematurely confirm a same-key replacement (#22186)', async () => {
        const script = `
            import Neo       from './src/Neo.mjs';
            import * as core from './src/core/_export.mjs';
            import {setup}   from './test/playwright/setup.mjs';

            setup({mockMain: false, neoConfig: {unitTestMode: true}});
            globalThis.postMessage = () => {};
            delete Neo.worker.App;
            delete Neo.worker.Canvas;

            const
                {default: canvasWorker} = await import('./src/worker/Canvas.mjs'),
                {default: app}          = await import('./src/worker/App.mjs'),
                {default: CanvasCmp}    = await import('./src/component/Canvas.mjs'),
                mainToCanvas            = [],
                canvasToApp             = [],
                appToCanvas             = [],
                report                  = {};

            Object.assign(canvasWorker, {
                canvasWindowMap: {},
                isSharedWorker : true,
                map            : {},
                ports          : [],
                promises       : {}
            });

            canvasWorker.sendMessage = (dest, msg) => {
                if (dest === 'app' && msg.action === 'canvasRegistered') {
                    canvasToApp.push(msg)
                }
            };
            Neo.worker.Canvas = {
                unregisterCanvas: async data => {
                    appToCanvas.push(data)
                }
            };

            const makeNode = label => ({getContext: () => ({}), height: 45, label, width: 139});
            const labels   = ['old', 'new', 'dispose-old', 'dispose-new'];
            let seq = 0;

            Neo.main = {
                DomAccess: {
                    transferCanvasToWorker(opts) {
                        const label = labels[seq++] ?? ('xfer-' + seq);
                        mainToCanvas.push({
                            action     : 'registerCanvasDirect',
                            componentId: opts.componentId,
                            node       : makeNode(label),
                            nodeId     : opts.nodeId,
                            transferId : opts.transferId,
                            windowId   : opts.windowId
                        });
                        return {transferred: true}
                    }
                }
            };

            // Arm A: Component-driven remount on same (nodeId, windowId)
            const cmp = Neo.create({
                module     : CanvasCmp,
                id         : 'cell-reuse',
                monitorSize: false,
                windowId   : 'win-opener'
            });
            cmp.timeout = () => Promise.resolve();

            cmp.mounted = true;
            await Promise.resolve();
            await Promise.resolve();

            // Deliver Transfer 1 ('old') to Canvas -> queues canvasRegistered #1 on canvasToApp
            canvasWorker.registerCanvasDirect(mainToCanvas.shift());

            // Unmount and remount on same (nodeId, windowId) before canvasRegistered #1 reaches App
            cmp.mounted = false;
            cmp.mounted = true;
            await Promise.resolve();
            await Promise.resolve();

            // Transfer 2 ('new') is now pending on cmp (callback parked) and queued in mainToCanvas
            report.transfer2QueuedBeforeStaleAck = mainToCanvas.length === 1 && !cmp.offscreenRegistered;

            // Deliver stale canvasRegistered #1 to App while Transfer 2 awaits its own ack
            app.onCanvasRegistered(canvasToApp.shift());
            report.staleAckDidNotConfirmReplacement = !cmp.offscreenRegistered && Boolean(cmp.registerCanvasCallbacks['cell-reuse']);
            report.cleanupQueuedForOldTransfer      = appToCanvas.length === 1;

            // Replacement reaches Canvas BEFORE delayed cleanup from App arrives
            canvasWorker.registerCanvasDirect(mainToCanvas.shift());
            report.beforeDelayedCleanup = canvasWorker.map['cell-reuse']?.label ?? null;

            // Deliver delayed cleanup for Transfer 1 -> must NOT evict 'new'
            canvasWorker.unregisterCanvas(appToCanvas.shift());
            report.afterDelayedCleanup = {
                mapLabel   : canvasWorker.map['cell-reuse']?.label ?? null,
                windowLabel: canvasWorker.canvasWindowMap['cell-reuse']?.['win-opener']?.label ?? null
            };

            // Deliver Transfer 2's own canvasRegistered -> confirms replacement
            app.onCanvasRegistered(canvasToApp.shift());
            await Promise.resolve();
            await Promise.resolve();
            report.replacementConfirmed = cmp.offscreenRegistered;

            // Arm B: Direct registerCanvasDirect without pre-stamped transferId (receiver-minted token)
            canvasWorker.registerCanvasDirect({
                componentId: 'retired-direct',
                node       : makeNode('direct-old'),
                nodeId     : 'cell-direct',
                windowId   : 'win-opener'
            });
            app.onCanvasRegistered(canvasToApp.shift()); // queues cleanup with receiver-minted transferId
            canvasWorker.registerCanvasDirect({
                componentId: 'live-direct',
                node       : makeNode('direct-new'),
                nodeId     : 'cell-direct',
                windowId   : 'win-opener'
            });
            canvasWorker.unregisterCanvas(appToCanvas.shift());
            report.directReplacementSurvived = {
                mapLabel   : canvasWorker.map['cell-direct']?.label ?? null,
                windowLabel: canvasWorker.canvasWindowMap['cell-direct']?.['win-opener']?.label ?? null
            };

            cmp.destroy();
            appToCanvas.length = 0;
            canvasToApp.length = 0;

            // Arm C: Destroy-and-recreate two distinct Canvas instances with the exact same explicit id and windowId
            const disposedCmp = Neo.create({
                module     : CanvasCmp,
                id         : 'same-key-dispose',
                monitorSize: false,
                windowId   : 'win-opener'
            });
            disposedCmp.timeout = () => Promise.resolve();
            disposedCmp.mounted = true;
            await Promise.resolve();
            await Promise.resolve();

            const firstDisposeTransferId = mainToCanvas[0]?.transferId;
            canvasWorker.registerCanvasDirect(mainToCanvas.shift()); // queues canvasRegistered for disposedCmp
            disposedCmp.destroy();

            const recreatedCmp = Neo.create({
                module     : CanvasCmp,
                id         : 'same-key-dispose',
                monitorSize: false,
                windowId   : 'win-opener'
            });
            recreatedCmp.timeout = () => Promise.resolve();
            recreatedCmp.mounted = true;
            await Promise.resolve();
            await Promise.resolve();

            const secondDisposeTransferId = mainToCanvas[0]?.transferId;
            report.distinctTokensAcrossRecreate = Boolean(firstDisposeTransferId && secondDisposeTransferId && firstDisposeTransferId !== secondDisposeTransferId);

            // Stale ack from destroyed instance arrives before recreated instance's transfer reaches Canvas
            app.onCanvasRegistered(canvasToApp.shift());
            report.recreatedNotPrematurelyConfirmed = !recreatedCmp.offscreenRegistered && Boolean(recreatedCmp.registerCanvasCallbacks['same-key-dispose']);

            // Recreated instance's surface reaches Canvas BEFORE destroyed instance's delayed cleanup arrives
            canvasWorker.registerCanvasDirect(mainToCanvas.shift());
            canvasWorker.unregisterCanvas(appToCanvas.shift());
            report.recreatedSurvivedDelayedCleanup = {
                mapLabel   : canvasWorker.map['same-key-dispose']?.label ?? null,
                windowLabel: canvasWorker.canvasWindowMap['same-key-dispose']?.['win-opener']?.label ?? null
            };

            // Recreated instance's own ack confirms it
            app.onCanvasRegistered(canvasToApp.shift());
            await Promise.resolve();
            await Promise.resolve();
            report.recreatedConfirmed = recreatedCmp.offscreenRegistered;

            recreatedCmp.destroy();
            console.log(JSON.stringify(report));
            process.exit(0)
        `;

        const {stdout} = await execFileAsync(process.execPath, ['--input-type=module', '-e', script], {
            cwd     : REPO_ROOT,
            encoding: 'utf8',
            timeout : 15_000
        });
        const report = JSON.parse(stdout.trim().split('\n').at(-1));

        expect(report).toEqual({
            afterDelayedCleanup             : {mapLabel: 'new', windowLabel: 'new'},
            beforeDelayedCleanup            : 'new',
            cleanupQueuedForOldTransfer     : true,
            directReplacementSurvived       : {mapLabel: 'direct-new', windowLabel: 'direct-new'},
            distinctTokensAcrossRecreate    : true,
            recreatedConfirmed              : true,
            recreatedNotPrematurelyConfirmed: true,
            recreatedSurvivedDelayedCleanup : {mapLabel: 'dispose-new', windowLabel: 'dispose-new'},
            replacementConfirmed            : true,
            staleAckDidNotConfirmReplacement: true,
            transfer2QueuedBeforeStaleAck   : true
        })
    })
});
