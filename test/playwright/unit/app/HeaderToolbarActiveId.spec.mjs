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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import BaseToolbar    from '../../../../src/toolbar/Base.mjs';
import Toolbar        from '../../../../src/app/header/Toolbar.mjs';
// Registers `Neo.vdom.Helper`, which mounting a component through `initVnode()` needs.
import VdomHelper     from '../../../../src/vdom/Helper.mjs';

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
 * The production toolbar with the canvas swapped for the stub.
 * @class Neo.test.app.HeaderToolbarHost
 * @extends Neo.app.header.Toolbar
 */
class HeaderToolbarHost extends Toolbar {
    static config = {
        className: 'Neo.test.app.HeaderToolbarHost',
        items: [
            {reference: 'home-button',     route: '/',         text: 'Home'},
            {reference: 'learn-button',    route: '/learn',    text: 'Learn'},
            {reference: 'services-button', route: '/services', text: 'Connect'}
        ]
    }

    onConstructed() {
        // Skips `Neo.app.header.Toolbar#onConstructed`, which adds the worker-backed canvas.
        BaseToolbar.prototype.onConstructed.call(this);

        this.add({module: HeaderCanvasStub, reference: 'header-canvas'})
    }
}

Neo.setupClass(HeaderToolbarHost);

/**
 * @param {Neo.app.header.Toolbar} toolbar
 * @returns {String[]} The references of the links that carry `aria-current`
 */
function currentLinks(toolbar) {
    return ['home-button', 'learn-button', 'services-button']
        .filter(reference => toolbar.getReference(reference).getVdomRoot()['aria-current'] !== undefined)
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
    })
});
