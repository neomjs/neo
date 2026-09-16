import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'ComponentProxyTraversalTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import Component          from '../../../../src/component/Base.mjs';
import ComponentManager   from '../../../../src/manager/Component.mjs';
import Container          from '../../../../src/container/Base.mjs';
import DragProxyContainer from '../../../../src/draggable/DragProxyContainer.mjs';

const appName = 'ComponentProxyTraversalTest';

/**
 * @summary Both manager traversals against a subtree a drag proxy hosts.
 *
 * A drag re-parents the dragged component into a `draggable.DragProxyContainer` rooted at `document.body`,
 * and keeps the container it came from as the proxy's `parentComponent` — the logical owner. The component
 * keeps rendering and keeps its identity; only the two parent notions now disagree, and `component.Abstract`
 * already ranks them: `parent` prefers `parentComponent`. These arms ask the manager to agree with it.
 */
test.describe('Neo.manager.Component traversal across a drag proxy', () => {
    let dragProxy, owner, widget;

    test.afterEach(() => {
        dragProxy?.destroy();
        owner?.destroy();
        widget?.destroy();
        dragProxy = owner = widget = null
    });

    /**
     * @summary Builds `owner > panel > widget`, then hosts `panel` in a proxy the way a drag does.
     *
     * Mirrors `DragZone#createDragProxy` (`parentId: proxyParentId`, `parentComponent: owner`) and
     * `dashboard/SortZone#startRemoteDrag` (the live component as the proxy's item).
     * @returns {Neo.component.Base} the panel now hosted by the proxy
     */
    function hostPanelInProxy() {
        owner = Neo.create(Container, {
            appName,
            parentId: 'document.body',

            items: [{
                module   : Container,
                reference: 'panel',
                items    : [{module: Component, reference: 'widget'}]
            }, {
                module   : Component,
                reference: 'sibling'
            }]
        });

        const panel = owner.down({reference: 'panel'});

        widget = owner.down({reference: 'widget'});

        owner.remove(panel, false);

        dragProxy = Neo.create(DragProxyContainer, {
            appName,
            items           : [panel],
            moveInMainThread: false,
            parentComponent : owner,
            parentId        : 'document.body'
        });

        return panel
    }

    test('down() from the owner reaches a component the proxy hosts', () => {
        hostPanelInProxy();

        // The state the arm is about: alive and rendering, and the two parent notions disagree
        expect(Neo.getComponent(widget.id), 'the widget is alive').toBe(widget);
        expect(widget.parent.parent.parent, 'its logical chain still runs through the owner').toBe(owner);

        expect(owner.down({reference: 'widget'}), 'the owner finds what it still owns').toBe(widget)
    });

    test('up() from the hosted component reaches the owner', () => {
        hostPanelInProxy();

        expect(widget.up({id: owner.id}), 'the owner is above it, through the proxy').toBe(owner)
    });

    test('down() returns a doubly reachable component once', () => {
        hostPanelInProxy();

        const matches = ComponentManager.down(owner, {appName}, false),
              ids     = matches.map(component => component.id);

        expect(new Set(ids).size, 'no component is visited twice').toBe(ids.length);
        expect(ids, 'the sibling that never moved is still found').toContain(owner.down({reference: 'sibling'}).id)
    });

    test('CONTROL: an unrelated container does not see the proxy contents', () => {
        hostPanelInProxy();

        const stranger = Neo.create(Container, {appName, parentId: 'document.body', items: []});

        expect(stranger.down({reference: 'widget'}), 'ownership is the rule, not global reachability').toBeNull();

        stranger.destroy()
    })
});
