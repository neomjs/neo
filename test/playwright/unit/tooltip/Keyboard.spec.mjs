import {setup} from '../../setup.mjs';

const appName = 'TooltipKeyboardTest';

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
import Container      from '../../../../src/container/Base.mjs';
import DomEvent       from '../../../../src/manager/DomEvent.mjs';
// the spec stands in for the thread entrypoint, which imports the instance manager Neo.get resolves through
import                     '../../../../src/manager/Instance.mjs';
import Tooltip        from '../../../../src/tooltip/Base.mjs';

/**
 * @summary A serialized DOM node, as Main sends it along an event path
 * @param {String} id
 * @param {Object} [data={}]
 * @param {String} [tagName='div']
 * @returns {Object}
 */
const node = (id, data={}, tagName='div') => ({cls: [], data, id, tagName});

/**
 * @summary Dispatches a DOM event through `Neo.manager.DomEvent`, along a path that ends at the window's body
 * @param {String} eventName
 * @param {Object[]} path From the event target upwards
 * @param {Object} [data={}]
 */
const fire = (eventName, path, data={}) => DomEvent.fire({eventName, data: {...data, path: [...path, node('document.body', {}, 'body')]}});

/**
 * @summary Records what a tooltip shows and hides. The show stands in for the mount flight, which needs Main; the hide
 * runs for real.
 * @param {Neo.tooltip.Base} tooltip
 * @returns {String[]}
 */
const watch = tooltip => {
    let calls = [],
        hide  = tooltip.hide.bind(tooltip);

    tooltip.show = () => {calls.push(`show ${tooltip.activeTargetId}`)};
    tooltip.hide = () => {calls.push('hide'); hide()};

    return calls
};

test.describe('Neo.tooltip.Base keyboard', () => {
    let created = [];

    const create = config => {
        let instance = Neo.create(config);
        created.push(instance);
        return instance
    };

    test.afterEach(() => {
        created.reverse().forEach(instance => instance.isDestroyed || instance.destroy());
        created = []
    });

    /**
     * @summary A root with a target of two buttons and a sibling outside it, and a tooltip of the target's own
     * @returns {{calls: String[], tooltip: Neo.tooltip.Base}}
     */
    const mountOwnTooltip = () => {
        create({module: Container, appName, id: 'kb-root', items: [
            {module: Component, id: 'kb-target', vdom: {cn: [{tag: 'button', id: 'kb-target-a'}, {tag: 'button', id: 'kb-target-b'}]}},
            {module: Component, id: 'kb-other'}
        ]});

        let tooltip = create({module: Tooltip, appName, componentId: 'kb-target', showDelay: 0});

        return {calls: watch(tooltip), tooltip}
    };

    const inTarget = id => [node(id), node('kb-target'), node('kb-root')];

    test('focus on a target shows its tooltip, and focus that leaves the target hides it', () => {
        let {calls, tooltip} = mountOwnTooltip();

        fire('focusin', inTarget('kb-target-a'));
        expect(calls).toEqual(['show kb-target']);

        fire('focusout', inTarget('kb-target-a'), {relatedTarget: node('kb-other')});
        expect(calls).toEqual(['show kb-target', 'hide']);
        expect(tooltip.activeTargetId).toBe(null)
    });

    test('Escape hides the tooltip a focused target shows, and other keys leave it', () => {
        let {calls} = mountOwnTooltip();

        fire('focusin', inTarget('kb-target-a'));
        fire('keydown', inTarget('kb-target-a'), {key: 'Tab'});
        expect(calls).toEqual(['show kb-target']);

        fire('keydown', inTarget('kb-target-a'), {key: 'Escape'});
        fire('keydown', inTarget('kb-target-a'), {key: 'Escape'});
        expect(calls).toEqual(['show kb-target', 'hide'])
    });

    test('a move between two nodes of the target keeps its tooltip, and focus outside every root shows none', () => {
        let {calls} = mountOwnTooltip();

        fire('focusin',  inTarget('kb-target-a'));
        fire('focusout', inTarget('kb-target-a'), {relatedTarget: node('kb-target-b')});
        fire('focusin',  inTarget('kb-target-b'));
        expect(calls).toEqual(['show kb-target']);

        fire('focusout', inTarget('kb-target-b'), {relatedTarget: node('kb-other')});
        fire('focusin',  [node('kb-other'), node('kb-root')]);
        expect(calls).toEqual(['show kb-target', 'hide'])
    });

    test('a delegate reaches a `data-neo-tooltip` node by focus, as the shared tooltip of a window does', () => {
        let root    = create({module: Component, appName, id: 'kb-shared-root', vdom: {cn: [{tag: 'span', id: 'kb-pill'}, {tag: 'button', id: 'kb-plain'}]}}),
            tooltip = create({module: Tooltip, appName, delegate: Tooltip.delegateFilter, showDelay: 0}),
            calls   = watch(tooltip);

        tooltip.addDelegationRoot(root);

        fire('focusin', [node('kb-plain'), node('kb-shared-root')]);
        expect(calls).toEqual([]);

        fire('focusin', [node('kb-pill', {neoTooltip: 'Hint'}), node('kb-shared-root')]);
        expect(calls).toEqual(['show kb-pill'])
    });

    test('an own tooltip wears the theme of the target it shows for', () => {
        let {calls, tooltip} = mountOwnTooltip();

        Neo.getComponent('kb-root').theme = 'neo-theme-neo-dark';

        fire('focusin', inTarget('kb-target-a'));
        expect(calls).toEqual(['show kb-target']);
        expect(tooltip.theme).toBe('neo-theme-neo-dark')
    });

    test('a destroyed tooltip stops listening at the body', () => {
        let {tooltip} = mountOwnTooltip(),
            listening = () => ['focusin', 'focusout', 'keydown'].map(eventName => !!DomEvent.bodyListenerOwners.get(eventName)?.has(tooltip.id));

        expect(listening()).toEqual([true, true, true]);

        tooltip.destroy();
        expect(listening()).toEqual([false, false, false])
    })
});
