import {setup} from '../../setup.mjs';

const appName = 'FloatingActionButtonTest';

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
import FloatingAction from '../../../../src/button/FloatingAction.mjs';

/**
 * @summary Feeds one scroll event of the element `id` inside the target into the button, as the DOM listener would.
 * @param {Neo.button.FloatingAction} button
 * @param {Number} scrollTop
 * @param {String} [id='scroller']
 */
function scrollTo(button, scrollTop, id='scroller') {
    button.onTargetScroll({scrollTop, target: {id}})
}

/**
 * @summary True when `target` holds the scroll listener of the button with `buttonId`. `domListeners` clones its
 * items on read, so the listener is found by its method and scope, not by object identity.
 * @param {Neo.component.Base} target
 * @param {String} buttonId
 * @returns {Boolean}
 */
function hasListener(target, buttonId) {
    return (target.domListeners || []).some(item =>
        item.scroll === FloatingAction.prototype.onTargetScroll && item.scope?.id === buttonId
    )
}

test.describe('Neo.button.FloatingAction', () => {
    let instances;

    test.beforeEach(() => {
        instances = []
    });

    test.afterEach(() => {
        instances.forEach(instance => !instance.isDestroyed && instance.destroy())
    });

    /**
     * @param {Neo.core.Base} module
     * @param {Object} [config]
     * @returns {Neo.core.Base}
     */
    function create(module, config) {
        let instance = Neo.create(module, {appName, ...config});
        instances.push(instance);
        return instance
    }

    /**
     * @param {Object} [config]
     * @returns {Neo.button.FloatingAction}
     */
    function createButton(config) {
        return create(FloatingAction, {iconCls: 'fa fa-plus', text: 'New task', ...config})
    }

    test('is a Button placed at the end of the bottom edge, extended by default', () => {
        let button = createButton();

        expect(button.cls).toContain('neo-floating-action-button');
        expect(button.cls).toContain('neo-button');
        expect(button.cls).toContain('neo-position-end');
        expect(button.cls).not.toContain('neo-collapsed');
        expect(button.cls).not.toContain('neo-scroll-hidden')
    });

    test('extended: false collapses to the icon and keeps the text as the accessible name', () => {
        let button = createButton({extended: false});

        expect(button.cls).toContain('neo-collapsed');
        expect(button.textNode.text).toBe('New task');
        expect(button.textNode.removeDom).toBeFalsy()
    });

    test('position swaps its class and rejects a value outside start, center and end', () => {
        let button = createButton();

        button.position = 'center';
        expect(button.cls).toContain('neo-position-center');
        expect(button.cls).not.toContain('neo-position-end');

        button.position = 'top';
        expect(button.position).toBe('center')
    });

    test('collapse: down by the threshold collapses, a smaller move changes nothing, up or the top restores', () => {
        let button = createButton({scrollBehavior: 'collapse'});

        scrollTo(button, 50);
        expect(button.cls).toContain('neo-collapsed');

        scrollTo(button, 46); // 4px up: jitter
        expect(button.cls).toContain('neo-collapsed');

        scrollTo(button, 30); // 20px up
        expect(button.cls).not.toContain('neo-collapsed');

        scrollTo(button, 200);
        expect(button.cls).toContain('neo-collapsed');

        scrollTo(button, 0);
        expect(button.cls).not.toContain('neo-collapsed')
    });

    test('one coalesced scroll event from the top already has a direction', () => {
        let button = createButton({scrollBehavior: 'hide'});

        scrollTo(button, 500); // the only event of a fast fling
        expect(button.cls).toContain('neo-scroll-hidden')
    });

    test('hide: a downward scroll hides the button instead of collapsing it', () => {
        let button = createButton({scrollBehavior: 'hide'});

        scrollTo(button, 80);
        expect(button.cls).toContain('neo-scroll-hidden');
        expect(button.cls).not.toContain('neo-collapsed');

        scrollTo(button, 40);
        expect(button.cls).not.toContain('neo-scroll-hidden')
    });

    test('each scrolling element inside the target keeps its own position', () => {
        let button = createButton({scrollBehavior: 'hide'});

        scrollTo(button, 300, 'list');
        expect(button.cls).toContain('neo-scroll-hidden');

        scrollTo(button, 4, 'nested'); // 4px from its own top, not 296px up from the list
        expect(button.cls).toContain('neo-scroll-hidden');

        scrollTo(button, 250, 'list');
        expect(button.cls).not.toContain('neo-scroll-hidden')
    });

    test('no scrollBehavior: scrolling changes nothing, and clearing it restores a scrolled-away button', () => {
        let button = createButton();

        scrollTo(button, 300);
        expect(button.cls).not.toContain('neo-collapsed');
        expect(button.cls).not.toContain('neo-scroll-hidden');

        button.scrollBehavior = 'hide';
        scrollTo(button, 600);
        expect(button.cls).toContain('neo-scroll-hidden');

        button.scrollBehavior = null;
        expect(button.scrolledAway).toBe(false);
        expect(button.cls).not.toContain('neo-scroll-hidden')
    });

    test('scrollTarget resolves an id and moves its listener on change, null and destroy', () => {
        let first    = create(Component),
            second   = create(Component),
            button   = createButton(),
            buttonId = button.id;

        button.scrollTarget = first.id;
        expect(button.scrollTarget).toBe(first);
        expect(hasListener(first, buttonId)).toBe(true);

        button.scrollTarget = second;
        expect(hasListener(first,  buttonId)).toBe(false);
        expect(hasListener(second, buttonId)).toBe(true);

        button.scrollTarget = null;
        expect(hasListener(second, buttonId)).toBe(false);

        button.scrollTarget = second;
        button.destroy();
        expect(hasListener(second, buttonId)).toBe(false)
    });

    test('two buttons on one target each keep their own listener', () => {
        let target = create(Component),
            add    = createButton({scrollTarget: target}),
            filter = createButton({scrollTarget: target});

        expect(hasListener(target, add.id))   .toBe(true);
        expect(hasListener(target, filter.id)).toBe(true);

        add.destroy();
        expect(hasListener(target, add.id))   .toBe(false);
        expect(hasListener(target, filter.id)).toBe(true)
    })
});
