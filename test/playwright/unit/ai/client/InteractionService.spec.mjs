import {setup} from '../../../setup.mjs';

setup({
    appConfig: {name: 'InteractionServiceAtomicDragUnit'},
    neoConfig: {unitTestMode: true}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

const {default: InteractionService, registerInteractionServiceMethods} =
    await import('../../../../../src/ai/client/InteractionService.mjs');

test.describe('Neo.ai.client.InteractionService', () => {
    const
        originalImportAddon    = Neo.Main.importAddon,
        originalGetWindowData  = Neo.Main.getWindowData,
        originalEventSimulator = Neo.main.addon.EventSimulator;

    test.afterEach(() => {
        Neo.Main.importAddon   = originalImportAddon;
        Neo.Main.getWindowData = originalGetWindowData;

        originalEventSimulator === undefined ?
            delete Neo.main.addon.EventSimulator :
            Neo.main.addon.EventSimulator = originalEventSimulator
    });

    test('simulateEvent executes the full raw sequence and aggregates a failed dispatch', async () => {
        const
            trace   = [],
            results = [true, false, true],
            host    = {
                async dispatch(event) {
                    trace.push(['dispatch', event.type]);

                    return results.shift()
                },
                async timeout(delay) {
                    trace.push(['delay', delay])
                }
            },
            outcome = await InteractionService.prototype.simulateEvent.call(host, {
                events: [
                    {targetId: 'source', type: 'mousedown', windowId: 'main'},
                    {delay: 20, targetId: 'missing', type: 'mousemove', windowId: 'main'},
                    {targetId: 'document.body', type: 'mouseup', windowId: 'main'}
                ]
            });

        expect(outcome).toBe(false);
        expect(trace).toEqual([
            ['dispatch', 'mousedown'],
            ['delay', 20],
            ['dispatch', 'mousemove'],
            ['dispatch', 'mouseup']
        ])
    });

    test('simulateEvent stays true only when every delegated dispatch succeeds', async () => {
        const host = {
            dispatch: async () => true,
            timeout : async () => {}
        };

        await expect(InteractionService.prototype.simulateEvent.call(host, {
            events: [{targetId: 'a', type: 'click', windowId: 'main'}]
        })).resolves.toBe(true)
    });

    test('Client registration routes drive_drag through the InteractionService', () => {
        const
            map     = {get_window: {}},
            service = {};

        expect(registerInteractionServiceMethods(map, service)).toBe(map);
        expect(map).toMatchObject({
            drive_drag    : service,
            simulate_event: service
        })
    });

    test('resolveWindow reads the current owning Main realm when no projected geometry exists', async () => {
        Neo.Main.getWindowData = async ({windowId}) => {
            expect(windowId).toBe('source-window');

            return {
                innerHeight: 500,
                innerWidth : 800,
                outerHeight: 540,
                outerWidth : 820,
                screenLeft : 300,
                screenTop  : 400
            }
        };

        const resolved = await InteractionService.prototype.resolveWindow('source-window');

        expect(resolved.id).toBe('source-window');
        // `screenLeft/Top` is the frame origin; the viewport sits inside the 10 px side border and
        // the 30 px title bar this report carries (820−800 → 10 each side; 540−500−10 → 30 on top)
        expect(resolved.innerRect).toMatchObject({height: 500, width: 800, x: 310, y: 430});
        expect(resolved.outerRect).toMatchObject({height: 540, width: 820, x: 300, y: 400})
    });

    test('driveDrag resolves target-local geometry into one source-window atomic plan', async () => {
        let captured,
            sourceReads = 0;

        const host = Object.create(InteractionService.prototype);

        Object.assign(host, {
            async resolveDomRect(targetId) {
                return targetId === 'source' ?
                    {height: 20, width: 40, x: 10, y: 20} :
                    {height: 30, width: 50, x: 100, y: 200}
            },
            resolveWindow(windowId) {
                windowId === 'source-window' && sourceReads++;

                return {
                    id       : windowId,
                    innerRect: windowId === 'source-window' ? {x: 300, y: 400} : {x: 1200, y: 700}
                }
            }
        });

        Neo.Main.importAddon = async () => true;
        Neo.main.addon.EventSimulator = {
            async driveDrag(request) {
                captured = request;
                return {success: true, phase: 'complete'}
            }
        };

        const outcome = await InteractionService.prototype.driveDrag.call(host, {
            destination: {
                anchor  : {x: 1, y: 0.5},
                targetId: 'target',
                windowId: 'target-window'
            },
            durationMs: 160,
            source    : {
                anchor  : {x: 0.5, y: 0.5},
                targetId: 'source',
                windowId: 'source-window'
            },
            steps: 8
        });

        expect(outcome).toEqual({success: true, phase: 'complete'});
        expect(captured.windowId).toBe('source-window');
        expect(captured.source).toMatchObject({
            targetClient     : {x: 30, y: 30},
            screen           : {x: 330, y: 430},
            sourceEventClient: {x: 30, y: 30}
        });
        expect(captured.destination).toMatchObject({
            targetClient     : {x: 150, y: 215},
            screen           : {x: 1350, y: 915},
            sourceEventClient: {x: 1050, y: 515},
            windowId         : 'target-window'
        });
        expect(captured.path).toEqual([captured.destination])
        expect(sourceReads, 'one source-window snapshot owns the whole coordinate conversion').toBe(1)
    });

    test('resolveDescriptor supports target-local point and source-relative delta as exclusive modes', async () => {
        const
            host = Object.assign(Object.create(InteractionService.prototype), {
                resolveWindow: async windowId => ({id: windowId, innerRect: {x: 1000, y: 600}})
            }),
            sourceWindow = {id: 'source-window', innerRect: {x: 300, y: 400}},
            source       = {
                targetClient: {x: 30, y: 40},
                windowId    : 'source-window'
            },
            point = await host.resolveDescriptor({clientX: 50, clientY: 70, windowId: 'target-window'}, source, sourceWindow),
            delta = await host.resolveDescriptor({deltaX: 20, deltaY: -10}, source, sourceWindow);

        expect(point).toMatchObject({
            targetClient     : {x: 50, y: 70},
            screen           : {x: 1050, y: 670},
            sourceEventClient: {x: 750, y: 270}
        });
        expect(delta).toMatchObject({
            targetClient     : {x: 50, y: 30},
            screen           : {x: 350, y: 430},
            sourceEventClient: {x: 50, y: 30}
        });
        await expect(host.resolveDescriptor({clientX: 1, clientY: 2, deltaX: 3, windowId: 'target-window'}, source, sourceWindow))
            .rejects.toThrow(/exactly one/);
        expect(() => host.normalizeAnchor({x: -0.1, y: 0.5})).toThrow(/\[0,1\]/)
    });

    test('driveDrag rejects competing screen authority before any Main call', async () => {
        let called = false;

        const host = Object.create(InteractionService.prototype);

        Object.assign(host, {
            async resolveDomRect() {
                return {height: 20, width: 20, x: 10, y: 10}
            },
            resolveWindow(windowId) {
                return {id: windowId, innerRect: {x: 0, y: 0}}
            }
        });

        Neo.Main.importAddon = async () => {called = true};

        const outcome = await InteractionService.prototype.driveDrag.call(host, {
            destination: {clientX: 40, clientY: 20, screenX: 40, windowId: 'main'},
            source     : {targetId: 'source', windowId: 'main'}
        });

        expect(outcome).toMatchObject({
            success: false,
            phase  : 'resolution',
            error  : {code: 'DRIVE_RESOLUTION_FAILED'}
        });
        expect(called).toBe(false)
    })
});
