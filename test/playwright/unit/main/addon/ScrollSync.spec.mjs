import {setup} from '../../../setup.mjs';

setup({
    appConfig       : {name: 'NeoScrollSyncTest'},
    mockLocalStorage: false,
    mockMain        : false,
    neoConfig       : {unitTestMode: true}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

/**
 * @summary `Neo.main.addon.ScrollSync` keeps a source node and its target at one scroll position: after a registration
 * that came before its nodes, after a node was replaced, and both ways, without a synced scroll bouncing back.
 *
 * A mock node's `trigger()` delivers a scroll the way a browser does: to the document's capture listeners first,
 * then to the node's own.
 * @see Neo.main.addon.ScrollSync
 */
const
    originalDocument  = globalThis.document,
    originalDomAccess = Neo.main?.DomAccess,
    originalWindow    = globalThis.window,
    documentRef       = new EventTarget(),
    windowRef         = new EventTarget();

documentRef.body           = {};
documentRef.getElementById = () => null;
documentRef.querySelector  = () => null;

/**
 * @param {String} id
 * @returns {Object} A node with scroll state, its own listeners, and `trigger(type)`
 */
function createNode(id) {
    const listeners = {};

    return {
        id,
        scrollLeft: 0,
        scrollTop : 0,
        addEventListener(type, fn) {(listeners[type] ||= []).push(fn)},
        removeEventListener(type, fn) {listeners[type] = (listeners[type] || []).filter(item => item !== fn)},
        scrollTo({left, top}) {this.scrollLeft = left; this.scrollTop = top},
        trigger(type) {
            const event = new Event(type);

            Object.defineProperty(event, 'target', {value: this});
            documentRef.dispatchEvent(event);
            (listeners[type] || []).forEach(fn => fn(event))
        }
    }
}

test.describe('Neo.main.addon.ScrollSync', () => {
    let addon, DomAccess, nodes, originalGetElement, present, ScrollSync;

    test.beforeAll(async () => {
        globalThis.document = documentRef;
        globalThis.window   = windowRef;

        delete Neo.main?.DomAccess;

        ({default: DomAccess}  = await import('../../../../../src/main/DomAccess.mjs'));
        ({default: ScrollSync} = await import('../../../../../src/main/addon/ScrollSync.mjs'))
    });

    test.afterAll(() => {
        originalDomAccess === undefined ? delete Neo.main.DomAccess : Neo.main.DomAccess = originalDomAccess;
        originalDocument  === undefined ? delete globalThis.document : globalThis.document = originalDocument;
        originalWindow    === undefined ? delete globalThis.window   : globalThis.window   = originalWindow
    });

    test.beforeEach(() => {
        present            = {};
        nodes              = {bar: createNode('bar'), view: createNode('view')};
        originalGetElement = DomAccess.getElement;
        DomAccess.getElement = id => present[id] || null;

        // The lock ends on the next task, so an arm can scroll the other way after one await
        addon = Neo.create(ScrollSync, {lockTimeout: 0})
    });

    test.afterEach(() => {
        DomAccess.getElement = originalGetElement;
        addon.destroy();
        addon = null
    });

    test('a registration made before its nodes are in the document syncs once they are, both ways', async () => {
        addon.register({fromId: 'view', id: 'grid-1', toId: 'bar'});

        // The VDom worker's delta lands after the App worker's registration
        Object.assign(present, nodes);

        nodes.view.scrollTop = 40;
        nodes.view.trigger('scroll');
        expect(nodes.bar.scrollTop).toBe(40);

        await new Promise(resolve => setTimeout(resolve, 5));

        nodes.bar.scrollTop = 80;
        nodes.bar.trigger('scroll');
        expect(nodes.view.scrollTop, 'the target syncs back').toBe(80)
    });

    test('the echo of a synced scroll does not bounce back', () => {
        Object.assign(present, nodes);
        addon.register({fromId: 'view', id: 'grid-1', toId: 'bar'});

        nodes.view.scrollTop = 40;
        nodes.view.trigger('scroll');

        // The view moved on before the target's own scroll for the write at 40 arrived
        nodes.view.scrollTop = 50;
        nodes.bar.trigger('scroll');

        expect(nodes.bar.scrollTop, 'control: the target followed').toBe(40);
        expect(nodes.view.scrollTop, 'the echo leaves the source alone').toBe(50)
    });

    test('a node replaced under the same id keeps its sync', () => {
        Object.assign(present, nodes);
        addon.register({fromId: 'view', id: 'grid-1', toId: 'bar'});

        // A re-render puts a new view under the same id
        present.view = createNode('view');
        present.view.scrollTop = 30;
        present.view.trigger('scroll');

        expect(nodes.bar.scrollTop).toBe(30)
    });

    test('nodes keyed by data-neo-id sync and keep the echo lock while useDomIds is false', () => {
        const {useDomIds} = Neo.config;

        Neo.config.useDomIds = false;

        try {
            // The ids live in data-neo-id, as the renderer writes them in this mode
            for (const node of Object.values(nodes)) {
                node.dataset = {neoId: node.id};
                node.id      = ''
            }

            Object.assign(present, {bar: nodes.bar, view: nodes.view});
            addon.register({fromId: 'view', id: 'grid-1', toId: 'bar'});

            nodes.view.scrollTop = 40;
            nodes.view.trigger('scroll');
            expect(nodes.bar.scrollTop).toBe(40);

            nodes.view.scrollTop = 50;
            nodes.bar.trigger('scroll');
            expect(nodes.view.scrollTop, 'the echo leaves the source alone').toBe(50)
        } finally {
            Neo.config.useDomIds = useDomIds
        }
    });

    test('unregister ends the sync, and another registration keeps its own', () => {
        const other = {bar2: createNode('bar2'), view2: createNode('view2')};

        Object.assign(present, nodes, other);
        addon.register({fromId: 'view',  id: 'grid-1', toId: 'bar'});
        addon.register({fromId: 'view2', id: 'grid-2', toId: 'bar2'});

        addon.unregister({id: 'grid-1'});

        nodes.view.scrollTop = 40;
        nodes.view.trigger('scroll');
        other.view2.scrollTop = 20;
        other.view2.trigger('scroll');

        expect(nodes.bar.scrollTop, 'the unregistered pair').toBe(0);
        expect(other.bar2.scrollTop, 'the other pair').toBe(20)
    })
});
