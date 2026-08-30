import {setup} from '../../../setup.mjs';

setup({
    appConfig       : {name: 'MainNativeDragSourceUnit'},
    mockLocalStorage: false,
    mockMain        : false,
    neoConfig       : {unitTestMode: true}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

const
    originalDocument = globalThis.document,
    documentRef      = new EventTarget(),
    owners           = {};

documentRef.body           = {};
documentRef.getElementById = id => owners[id] ?? null;
documentRef.querySelector  = () => null;
globalThis.document        = documentRef;

const {default: NativeDragSource} = await import('../../../../../src/main/addon/NativeDragSource.mjs');

/**
 * A source node the addon can arm: attribute store, per-gesture draggable flag, and a closest()
 * answering the delegate selectors a test wires it for.
 */
function fakeNode(attributes = {}, closestMap = {}) {
    return {
        attributes,
        closestMap,
        draggable: false,
        closest(selector)        { return this.closestMap[selector] ?? null },
        getAttribute(name)       { return this.attributes[name] ?? null },
        removeAttribute(name)    { name === 'draggable' && (this.draggable = false) }
    }
}

function fakeDataTransfer() {
    return {
        data         : {},
        effectAllowed: 'uninitialized',
        setData(type, value) { this.data[type] = value }
    }
}

const press = (target, overrides = {}) => ({button: 0, ctrlKey: false, metaKey: false, target, ...overrides});

test.describe('Neo.main.addon.NativeDragSource', () => {
    let addon;

    test.beforeEach(() => {
        addon = Neo.create(NativeDragSource, {})
    });

    test.afterEach(() => {
        addon.destroy?.();
        for (const key of Object.keys(owners)) delete owners[key]
    });

    test.afterAll(() => {
        originalDocument === undefined ? delete globalThis.document : globalThis.document = originalDocument
    });

    function registerGrid(config = {}) {
        const node = fakeNode({'data-record-id': 'cid-42'});

        node.closestMap['.grid [data-record-id]'] = node;
        owners['grid-1'] = {contains: candidate => candidate === node};

        addon.register({
            delegate: '.grid [data-record-id]',
            ownerId : 'grid-1',
            types   : {
                'application/x-entity-id': '{data-record-id}',
                'text/plain'             : 'entity:{data-record-id}'
            },
            ...config
        });

        return node
    }

    test('a primary press on a registered source arms it; the gesture end disarms it', () => {
        const node = registerGrid();

        addon.onMouseDown(press(node));
        expect(node.draggable).toBe(true);

        addon.onGestureEnd();
        expect(node.draggable).toBe(false);
        expect(addon.armed).toBe(null)
    });

    test('secondary presses never arm: context menus and macOS secondary clicks stay menus', () => {
        const node = registerGrid();

        addon.onMouseDown(press(node, {button: 2}));
        addon.onMouseDown(press(node, {ctrlKey: true}));
        addon.onMouseDown(press(node, {metaKey: true}));

        expect(node.draggable).toBe(false)
    });

    test('dragstart fills every declared type from the source node attributes, and only for the armed node', () => {
        const node = registerGrid(),
              dt   = fakeDataTransfer();

        addon.onMouseDown(press(node));
        addon.onDragStart({target: node, dataTransfer: dt});

        expect(dt.data['application/x-entity-id']).toBe('cid-42');
        expect(dt.data['text/plain']).toBe('entity:cid-42');
        expect(dt.effectAllowed).toBe('copy');

        const strangerDt = fakeDataTransfer();
        addon.onDragStart({target: fakeNode(), dataTransfer: strangerDt});
        expect(strangerDt.data).toEqual({})
    });

    test('effectAllowed is the declaration owner\'s choice', () => {
        const node = registerGrid({effectAllowed: 'move'}),
              dt   = fakeDataTransfer();

        addon.onMouseDown(press(node));
        addon.onDragStart({target: node, dataTransfer: dt});

        expect(dt.effectAllowed).toBe('move')
    });

    test('a missing attribute renders as an empty string, never the literal placeholder', () => {
        const node = registerGrid();

        delete node.attributes['data-record-id'];

        const dt = fakeDataTransfer();
        addon.onMouseDown(press(node));
        addon.onDragStart({target: node, dataTransfer: dt});

        expect(dt.data['text/plain']).toBe('entity:')
    });

    test('claimsEvent is the sensor-facing partition line: true on registered sources, false after unregister', () => {
        const node = registerGrid();

        expect(addon.claimsEvent(press(node))).toBe(true);
        expect(addon.claimsEvent(press(fakeNode()))).toBe(false);

        addon.unregister({ownerId: 'grid-1'});
        expect(addon.claimsEvent(press(node))).toBe(false)
    });

    test('a delegate match outside the owner subtree neither arms nor claims', () => {
        const node = registerGrid();

        owners['grid-1'] = {contains: () => false};

        expect(addon.claimsEvent(press(node))).toBe(false);
        addon.onMouseDown(press(node));
        expect(node.draggable).toBe(false)
    });

    test('re-registering an owner replaces its declaration', () => {
        const node = registerGrid();

        addon.register({delegate: '.elsewhere', ownerId: 'grid-1', types: {}});

        expect(addon.claimsEvent(press(node))).toBe(false)
    });

    test('the sensor declines a gesture the addon claims — and claims the same gesture once unregistered', async () => {
        // importing the sensor constructs the DomEvents singleton, which expects a window
        const originalWindow = globalThis.window;
        globalThis.window    = new EventTarget();

        const {default: Mouse} = await import('../../../../../src/main/draggable/sensor/Mouse.mjs');

        const
            node  = registerGrid(),
            // a `neo-draggable` ancestor in the path: without the consult, the sensor would claim
            event = {
                button : 0,
                ctrlKey: false,
                metaKey: false,
                path   : [{classList: {contains: cls => cls === 'neo-draggable'}}],
                target : node
            },
            sensor = {
                delay            : 1,
                dragTargetClasses: ['neo-draggable', 'neo-resizable'],
                onDistanceChange : () => {},
                onMouseUp        : () => {}
            };

        Neo.main.addon = Neo.main.addon || {};
        Neo.main.addon.NativeDragSource = addon;

        try {
            Mouse.prototype.onMouseDown.call(sensor, event);
            expect(sensor.currentElement).toBeUndefined();

            addon.unregister({ownerId: 'grid-1'});

            Mouse.prototype.onMouseDown.call(sensor, event);
            expect(sensor.currentElement).toBeDefined()
        } finally {
            clearTimeout(sensor.mouseDownTimeout);
            delete Neo.main.addon.NativeDragSource;
            originalWindow === undefined ? delete globalThis.window : globalThis.window = originalWindow
        }
    });
});
