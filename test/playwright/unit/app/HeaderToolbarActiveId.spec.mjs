/**
 * @file test/playwright/unit/app/HeaderToolbarActiveId.spec.mjs
 * @summary Pins that `Neo.app.header.Toolbar#activeId` marks the open section's link with `aria-current="page"`,
 * moves the mark when the section changes, clears it when no link stands for the open section, and hands the same
 * id on to the header canvas that draws the highlight.
 */

import {setup} from '../../setup.mjs';

const appName = 'HeaderToolbarActiveIdTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Component          from '../../../../src/component/Base.mjs';
import Toolbar            from '../../../../src/app/header/Toolbar.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
// Registers `Neo.vdom.Helper`, which mounting a component through `initVnode()` needs.
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

/**
 * A stand-in for the header canvas, which needs a worker: it only keeps the id the toolbar hands on.
 * @class Neo.test.app.HeaderCanvasStub
 * @extends Neo.component.Base
 */
class HeaderCanvasStub extends Component {
    static config = {
        className: 'Neo.test.app.HeaderCanvasStub',
        activeId_: null
    }
}

Neo.setupClass(HeaderCanvasStub);

/**
 * The production toolbar with the canvas swapped for the stub via `canvasConfig` so `Toolbar#onConstructed` runs in full.
 * @class Neo.test.app.HeaderToolbarHost
 * @extends Neo.app.header.Toolbar
 */
class HeaderToolbarHost extends Toolbar {
    static config = {
        className   : 'Neo.test.app.HeaderToolbarHost',
        canvasConfig: {module: HeaderCanvasStub},
        items       : [
            {reference: 'home-button',     route: '/',         text: 'Home'},
            {reference: 'learn-button',    route: '/learn',    text: 'Learn'},
            {reference: 'services-button', route: '/services', text: 'Connect'}
        ]
    }
}

Neo.setupClass(HeaderToolbarHost);

/**
 * @param {Neo.app.header.Toolbar} toolbar
 * @returns {String[]} The references of the links that carry `ariaCurrent === 'page'`
 */
function currentLinks(toolbar) {
    return ['home-button', 'learn-button', 'services-button']
        .filter(reference => {
            const button = toolbar.getReference(reference);
            return button.ariaCurrent === 'page' && button.getVdomRoot()['aria-current'] === 'page'
        })
}

test.describe('Neo.app.header.Toolbar activeId', () => {
    let toolbar;

    test.beforeEach(async () => {
        toolbar = Neo.create(HeaderToolbarHost, {appName});
        await toolbar.initVnode();
        toolbar.mounted = true
    });

    test.afterEach(() => {
        toolbar.destroy()
    });

    test('no link is marked while no section is open', () => {
        expect(toolbar.activeId).toBe(null);
        expect(currentLinks(toolbar)).toEqual([])
    });

    test('the open section\'s link renders aria-current="page" and no other link does', async () => {
        const learn = toolbar.getReference('learn-button');

        toolbar.activeId = learn.id;

        expect(learn.getVdomRoot()['aria-current']).toBe('page');
        expect(currentLinks(toolbar)).toEqual(['learn-button'])
    });

    test('switching sections moves the mark', async () => {
        toolbar.activeId = toolbar.getReference('home-button').id;
        expect(currentLinks(toolbar)).toEqual(['home-button']);

        toolbar.activeId = toolbar.getReference('services-button').id;
        expect(currentLinks(toolbar)).toEqual(['services-button'])
    });

    test('null clears the mark, as on a route without a header link', async () => {
        toolbar.activeId = toolbar.getReference('learn-button').id;
        expect(currentLinks(toolbar)).toEqual(['learn-button']);

        toolbar.activeId = null;
        expect(currentLinks(toolbar)).toEqual([])
    });

    test('the header canvas receives the same id', async () => {
        const canvas = toolbar.getReference('header-canvas'),
              learn  = toolbar.getReference('learn-button');

        toolbar.activeId = learn.id;
        expect(canvas.activeId).toBe(learn.id);

        toolbar.activeId = null;
        expect(canvas.activeId).toBe(null)
    });

    test('propagates construction-time activeId to both the target button and header-canvas', async () => {
        const constructed = Neo.create(HeaderToolbarHost, {
            appName,
            activeId: 'initial-learn-link',
            items   : [
                {id: 'initial-home-link',  reference: 'home-button',     route: '/',         text: 'Home'},
                {id: 'initial-learn-link', reference: 'learn-button',    route: '/learn',    text: 'Learn'},
                {id: 'initial-svc-link',   reference: 'services-button', route: '/services', text: 'Connect'}
            ]
        });

        try {
            await constructed.initVnode();
            const learn  = constructed.getReference('learn-button'),
                  canvas = constructed.getReference('header-canvas');

            expect(constructed.setAriaCurrent).toBeUndefined();
            expect(learn.ariaCurrent).toBe('page');
            expect(learn.vnode.attributes?.['aria-current']).toBe('page');
            expect(canvas.activeId).toBe('initial-learn-link');
            expect(currentLinks(constructed)).toEqual(['learn-button'])
        } finally {
            constructed.destroy()
        }
    });

    test('coalesces mounted sibling button ariaCurrent transitions into one VdomHelper.updateBatch flight', async () => {
        const home     = toolbar.getReference('home-button'),
              services = toolbar.getReference('services-button');

        toolbar.activeId = home.id;
        await toolbar.promiseUpdate();
        expect(home.vnode.attributes?.['aria-current']).toBe('page');

        const originalUpdateBatch = VdomHelper.updateBatch.bind(VdomHelper);
        let   batchFlights        = 0;

        VdomHelper.updateBatch = (...args) => {
            batchFlights++;
            return originalUpdateBatch(...args)
        };

        try {
            toolbar.activeId = services.id;
            await toolbar.promiseUpdate();

            expect(batchFlights).toBe(1);
            expect(home.ariaCurrent).toBeNull();
            expect(home.vnode.attributes?.['aria-current']).toBeUndefined();
            expect(services.ariaCurrent).toBe('page');
            expect(services.vnode.attributes?.['aria-current']).toBe('page')
        } finally {
            VdomHelper.updateBatch = originalUpdateBatch
        }
    })
});
