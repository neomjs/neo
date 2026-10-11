import {setup} from '../../setup.mjs';

const appName = 'DomAccessCanvasTransferTest';

// DomAccess is a main-thread singleton whose constructor installs document listeners.
// Give its one-time construction a minimal document before importing the production class.
const
    elements                 = new Map(),
    originalDocumentAtImport = globalThis.document,
    bootDocument             = {
        addEventListener() {},
        getElementById(id) { return elements.get(id) || null }
    };

globalThis.document = bootDocument;

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

if (Neo.main?.DomAccess && Neo.main.DomAccess.className !== 'Neo.main.DomAccess') {
    delete Neo.main.DomAccess
}

const {default: DomAccess} = await import('../../../../src/main/DomAccess.mjs');
globalThis.document = originalDocumentAtImport;

setup({
    appConfig: {name: appName},
    neoConfig: {unitTestMode: true, useDomIds: true}
});

const manager = Neo.worker.Manager;

let originalDocument, originalUseDomIds, originalStartWorker, originalSendMessage;
let workerConnected, allowWorkerStart, workerCreations, startCalls, sends, events;

/**
 * @summary Creates one element whose OffscreenCanvas boundary records whether the owner worker was ready first.
 * @param {String} id Stable DOM node id passed through DomAccess.
 * @returns {Object} Minimal canvas element with an observable transfer boundary.
 */
function createCanvas(id) {
    return {
        id,
        transferCount: 0,
        transferControlToOffscreen() {
            events.push(`transfer:${id}`);
            this.transferCount++;
            const wasConnected = workerConnected;

            if (!wasConnected) throw new Error('canvas worker was not connected before transfer');

            return {nodeId: id, wasConnected}
        }
    }
}

test.beforeEach(() => {
    originalDocument   = globalThis.document;
    originalUseDomIds  = Neo.config.useDomIds;
    originalStartWorker = manager.startWorker;
    originalSendMessage = manager.sendMessage;
    workerConnected    = false;
    allowWorkerStart   = true;
    workerCreations    = 0;
    startCalls         = [];
    sends              = [];
    events             = [];

    Neo.config.useDomIds = true;
    globalThis.document = {
        ...bootDocument,
        getElementById(id) { return elements.get(id) || null }
    };
    elements.clear();

    // A local owner-worker seam: the first ensure opens the cold worker, later ensures reuse it.
    // The native transfer boundary below itself refuses to run until this seam reports connected.
    manager.startWorker = ({name}) => {
        startCalls.push({name, wasConnected: workerConnected});
        events.push(`start:${name}:${workerConnected ? 'warm' : 'cold'}`);
        if (!allowWorkerStart) return false;
        if (!workerConnected) {
            workerConnected = true;
            workerCreations++
        }
        return true
    };

    // Record the production method's worker-message dispatch contract without mocking postMessage.
    manager.sendMessage = (destination, message, transfer) => {
        events.push(`send:${destination}:${message.nodeId}`);
        sends.push({destination, message, transfer});
        return {id: `canvas-transfer-${sends.length}`}
    }
});

test.afterEach(() => {
    elements.clear();
    manager.startWorker = originalStartWorker;
    manager.sendMessage = originalSendMessage;
    Neo.config.useDomIds = originalUseDomIds;
    globalThis.document = originalDocument
});

test.describe('Neo.main.DomAccess.transferCanvasToWorker worker admission', () => {
    test('connects the cold local Canvas Worker before transfer and reuses it for a warm second canvas', () => {
        const coldCanvas = createCanvas('cold-canvas'),
              warmCanvas = createCanvas('warm-canvas');

        elements.set(coldCanvas.id, coldCanvas);
        elements.set(warmCanvas.id, warmCanvas);

        DomAccess.transferCanvasToWorker({componentId: 'cold-sparkline', nodeId: coldCanvas.id});
        DomAccess.transferCanvasToWorker({componentId: 'warm-sparkline', nodeId: warmCanvas.id});

        expect(events).toEqual([
            'start:canvas:cold', 'transfer:cold-canvas', 'send:canvas:cold-canvas',
            'start:canvas:warm', 'transfer:warm-canvas', 'send:canvas:warm-canvas'
        ]);
        expect(startCalls).toEqual([
            {name: 'canvas', wasConnected: false},
            {name: 'canvas', wasConnected: true}
        ]);
        expect(workerCreations, 'the warm owner ensure reuses the connected worker').toBe(1);
        expect(coldCanvas.transferCount).toBe(1);
        expect(warmCanvas.transferCount).toBe(1);
        expect(sends.map(({destination, message}) => ({destination, action: message.action, componentId: message.componentId, nodeId: message.nodeId})))
            .toEqual([
                {destination: 'canvas', action: 'registerCanvasDirect', componentId: 'cold-sparkline', nodeId: 'cold-canvas'},
                {destination: 'canvas', action: 'registerCanvasDirect', componentId: 'warm-sparkline', nodeId: 'warm-canvas'}
            ]);
        expect(sends.every(({transfer}) => transfer?.length === 1 && transfer[0].wasConnected)).toBe(true)
    });

    test('worker-start refusal leaves the canvas untouched and sends no registration message', () => {
        allowWorkerStart = false;
        const canvas = createCanvas('refused-canvas');

        elements.set(canvas.id, canvas);
        DomAccess.transferCanvasToWorker({componentId: 'refused-sparkline', nodeId: canvas.id});

        expect(startCalls).toEqual([{name: 'canvas', wasConnected: false}]);
        expect(events).toEqual(['start:canvas:cold']);
        expect(canvas.transferCount, 'worker refusal precedes irreversible canvas extraction').toBe(0);
        expect(workerCreations).toBe(0);
        expect(sends).toEqual([]);
        expect(elements.get(canvas.id)).toBe(canvas)
    });

    test('a worker construction error leaves the canvas available for a later transfer', () => {
        const canvas = createCanvas('unavailable-worker-canvas');

        elements.set(canvas.id, canvas);
        manager.startWorker = () => {throw new Error('worker construction refused')};
        expect(() => DomAccess.transferCanvasToWorker({componentId: 'unavailable-sparkline', nodeId: canvas.id})).not.toThrow();
        expect(canvas.transferCount).toBe(0);
        expect(sends).toEqual([])
    });

    test('a missing DOM node does not start a worker or dispatch registration', () => {
        DomAccess.transferCanvasToWorker({componentId: 'missing-sparkline', nodeId: 'missing-canvas'});

        expect(startCalls).toEqual([]);
        expect(events).toEqual([]);
        expect(workerCreations).toBe(0);
        expect(sends).toEqual([])
    })
});
