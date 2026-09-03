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

// `body` carries the class list the addon stamps for a native drag's lifetime.
documentRef.body = {
    classList: {
        list: new Set(),
        add(cls)      { this.list.add(cls) },
        remove(cls)   { this.list.delete(cls) },
        contains(cls) { return this.list.has(cls) }
    }
};
documentRef.getElementById = id => owners[id] ?? null;
documentRef.querySelector  = () => null;
globalThis.document        = documentRef;

// the addon resolves owners through the dual-identity authority, not document.getElementById
const originalDomAccess = Neo.main?.DomAccess;
Neo.main           = Neo.main || {};
Neo.main.DomAccess = {getElement: id => owners[id] ?? null};

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
        // Re-assert the stubs: under fully-parallel CI, a sibling spec's afterAll teardown can
        // delete these globals between this file's tests — module-level assignment alone only
        // survives single-worker ordering.
        globalThis.document = documentRef;
        Neo.main            = Neo.main || {};
        Neo.main.DomAccess  = {getElement: id => owners[id] ?? null};

        addon = Neo.create(NativeDragSource, {})
    });

    test.afterEach(() => {
        addon.destroy?.();
        for (const key of Object.keys(owners)) delete owners[key]
    });

    test.afterAll(() => {
        originalDocument === undefined ? delete globalThis.document : globalThis.document = originalDocument;
        originalDomAccess === undefined ? delete Neo.main.DomAccess : Neo.main.DomAccess = originalDomAccess
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

    test('a native drag lifts the frame shields for its lifetime: stamped at dragstart, cleared at dragend and by the next press', () => {
        const node   = registerGrid(),
              lifted = () => document.body.classList.contains('neo-native-drag-active');

        addon.onMouseDown(press(node));
        expect(lifted(), 'a press alone lifts nothing').toBe(false);

        addon.onDragStart({target: node, dataTransfer: fakeDataTransfer()});
        expect(lifted(), 'a drag in flight lifts').toBe(true);

        addon.onGestureEnd();
        expect(lifted(), 'dragend clears').toBe(false);

        // Any native drag the document starts lifts, armed by this addon or not: a link, an image.
        addon.onDragStart({target: fakeNode(), dataTransfer: fakeDataTransfer()});
        expect(lifted(), 'a drag this addon did not arm lifts too').toBe(true);

        // dragend never fires for a source removed mid-drag, so the next press ends a lift instead.
        addon.onMouseDown(press(fakeNode()));
        expect(lifted(), 'the next press clears a lift its dragend never ended').toBe(false)
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

    test('an owner only the dual-identity authority resolves still claims and arms (useDomIds:false red control)', () => {
        // `useDomIds: false` renders `data-neo-id` instead of `id`: document.getElementById misses,
        // DomAccess.getElement resolves. Production reverted to a direct getElementById lookup
        // cannot pass this test — that revert stayed green before this red control existed.
        const node = fakeNode({'data-record-id': 'cid-neo'});

        node.closestMap['.grid [data-record-id]'] = node;

        Neo.main.DomAccess = {getElement: id => id === 'grid-neo' ? {contains: candidate => candidate === node} : null};
        expect(documentRef.getElementById('grid-neo')).toBe(null);

        addon.register({
            delegate: '.grid [data-record-id]',
            ownerId : 'grid-neo',
            types   : {'text/plain': 'entity:{data-record-id}'}
        });

        expect(addon.claimsEvent(press(node))).toBe(true);

        addon.onMouseDown(press(node));
        expect(addon.armed).not.toBe(null);
        expect(node.draggable).toBe(true)
    });

    test('a delegate match outside the owner subtree neither arms nor claims', () => {
        const node = registerGrid();

        owners['grid-1'] = {contains: () => false};

        expect(addon.claimsEvent(press(node))).toBe(false);
        addon.onMouseDown(press(node));
        expect(node.draggable).toBe(false)
    });

    test('a node that was ALREADY draggable still arms, still fills, and keeps its attribute on terminal', () => {
        const node = registerGrid();

        node.draggable = true;   // author-owned attribute, e.g. a link or image

        addon.onMouseDown(press(node));

        // claim and arm must agree: the sensor yielded via claimsEvent, so the addon owns the gesture
        expect(addon.armed).not.toBe(null);
        expect(addon.armed.addedAttribute).toBe(false);

        const dt = fakeDataTransfer();
        addon.onDragStart({target: node, dataTransfer: dt});
        expect(dt.data['text/plain']).toBe('entity:cid-42');

        addon.onGestureEnd();

        // restore only addon-owned DOM state: the author's attribute survives the gesture
        expect(node.draggable).toBe(true)
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

    /**
     * `{field:name}` — the resolution source that does not require the value to be in the DOM.
     *
     * A payload could only ever read attributes, so putting a business id on the clipboard meant
     * putting it in the DOM first; for a grid that meant `useInternalId: false`, and getting it
     * wrong was silent — `getAttribute` returned `neo-record-7`, `setData` accepted it, the drop
     * fired, and the receiver looked up an id that does not exist in its domain.
     *
     * @see https://github.com/neomjs/neo/issues/18113
     */
    test.describe('field tokens resolve from the registered map, not the DOM', () => {
        /**
         * Registers a source whose payload mixes both token forms, so every arm below measures
         * the two resolving side by side rather than in isolation.
         * @param {Object} [config] register() overrides
         * @returns {Object} the armable node
         */
        function registerWithFields(config = {}) {
            const node = fakeNode({'data-record-id': 'neo-record-7'});

            node.id = 'grid-1__row-0';
            node.closestMap['.grid [data-record-id]'] = node;
            owners['grid-1'] = {contains: candidate => candidate === node};

            addon.register({
                delegate: '.grid [data-record-id]',
                fields  : {'grid-1__row-0': {id: 'CNET-1234', title: 'Concept'}},
                ownerId : 'grid-1',
                types   : {
                    'application/x-entity-id': '{field:id}',
                    'text/plain'             : 'cnet:{field:id}',
                    'text/x-both'            : '{field:title}@{data-record-id}'
                },
                ...config
            });

            return node
        }

        test('a field token carries the store value while the node id stays the internal one', () => {
            const node         = registerWithFields(),
                  dataTransfer = fakeDataTransfer();

            addon.onMouseDown(press(node));
            addon.onDragStart({target: node, dataTransfer});

            // The node's own identity is untouched and still neo's — which is the entire point:
            // the payload no longer forces the DOM to carry the business id.
            expect(node.getAttribute('data-record-id'), 'the DOM still holds neo\'s id').toBe('neo-record-7');

            expect(dataTransfer.data['application/x-entity-id'], 'the payload holds the business id').toBe('CNET-1234');
            expect(dataTransfer.data['text/plain']).toBe('cnet:CNET-1234');

            // Both forms in ONE template, so the arm cannot pass by resolving every token the
            // same way.
            expect(dataTransfer.data['text/x-both'], 'the two sources resolve independently')
                .toBe('Concept@neo-record-7')
        });

        test('an unresolvable field yields the empty string, never the literal template', () => {
            // Matching `?? ''` for attributes exactly. The literal leaking through would put
            // `{field:missing}` on a real clipboard, which reads as a receiver bug, not ours.
            const node         = registerWithFields({types: {'text/plain': 'x:{field:missing}'}}),
                  dataTransfer = fakeDataTransfer();

            addon.onMouseDown(press(node));
            addon.onDragStart({target: node, dataTransfer});

            expect(dataTransfer.data['text/plain']).toBe('x:')
        });

        test('a registration with no field map behaves exactly as before', () => {
            // The control for every existing consumer: `fields` is absent, so an attribute
            // template must resolve unchanged and a field token must not throw on the way.
            const node         = registerGrid(),
                  dataTransfer = fakeDataTransfer();

            addon.onMouseDown(press(node));
            addon.onDragStart({target: node, dataTransfer});

            expect(dataTransfer.data['application/x-entity-id']).toBe('cid-42');
            expect(dataTransfer.data['text/plain']).toBe('entity:cid-42')
        });

        test('a node keyed by data-neo-id resolves too, because half the apps have no id attribute', () => {
            // `useDomIds: false` leaves `id` empty and puts identity in `data-neo-id`. Keying on
            // `node.id` alone would resolve nothing for those apps — silently, which is the
            // failure mode this whole ticket is about.
            const node = fakeNode({});

            node.dataset = {neoId: 'grid-2__row-3'};
            node.closestMap['.grid-2 .row'] = node;
            owners['grid-2'] = {contains: candidate => candidate === node};

            addon.register({
                delegate: '.grid-2 .row',
                fields  : {'grid-2__row-3': {id: 'CNET-99'}},
                ownerId : 'grid-2',
                types   : {'text/plain': '{field:id}'}
            });

            const dataTransfer = fakeDataTransfer();

            addon.onMouseDown(press(node));
            addon.onDragStart({target: node, dataTransfer});

            expect(dataTransfer.data['text/plain']).toBe('CNET-99')
        });

        test('updateFields replaces the map on a live registration, so a re-render is not stale', () => {
            const node = registerWithFields();

            // Pooled rows recycle node ids across records as they scroll, so the SAME node id
            // must be able to mean a different record after a render. A map captured once at
            // registration is the defect this path exists to prevent.
            addon.updateFields({ownerId: 'grid-1', fields: {'grid-1__row-0': {id: 'CNET-5678'}}});

            const dataTransfer = fakeDataTransfer();

            addon.onMouseDown(press(node));
            addon.onDragStart({target: node, dataTransfer});

            expect(dataTransfer.data['application/x-entity-id']).toBe('CNET-5678');

            // The rest of the declaration survived the refresh — it must not re-register.
            expect(addon.sources.get('grid-1').delegate).toBe('.grid [data-record-id]');
            expect(Object.keys(addon.sources.get('grid-1').types)).toHaveLength(3)
        });

        test('updateFields for an unknown owner is a no-op, because a render can outlive a retire', () => {
            registerWithFields();
            addon.unregister({ownerId: 'grid-1'});

            expect(() => addon.updateFields({ownerId: 'grid-1', fields: {a: {id: 'x'}}})).not.toThrow();
            expect(addon.sources.has('grid-1')).toBe(false)
        });

        test('the dragstart path is synchronous, so no value is ever fetched during a gesture', () => {
            // `DataTransfer` exists only synchronously inside a native dragstart: an await here
            // would silently produce an empty payload rather than an error. This asserts the
            // property structurally instead of hoping a timing test would notice.
            expect(NativeDragSource.prototype.onDragStart.constructor.name,
                'onDragStart must not be async').toBe('Function');
            expect(NativeDragSource.prototype.fieldsFor.constructor.name,
                'nor may its resolution helper be').toBe('Function');

            // And the values are present BEFORE the gesture, which is what makes that possible.
            const node = registerWithFields();

            expect(addon.sources.get('grid-1').fields['grid-1__row-0'].id,
                'the map is in memory ahead of any dragstart').toBe('CNET-1234');
            expect(addon.fieldsFor(addon.sources.get('grid-1'), node).id).toBe('CNET-1234')
        })
    })
});
