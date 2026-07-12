import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockTabEnterButtonTest'
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import DockMotionSignal   from '../../../../src/dashboard/DockMotionSignal.mjs';
import DockTabEnterButton from '../../../../src/dashboard/DockTabEnterButton.mjs';
import DockZoneModel      from '../../../../src/dashboard/DockZoneModel.mjs';
import MainContainer      from '../../../../examples/dashboard/dock/MainContainer.mjs';

const createModel = () => ({
    schema: 'neo.harness.dockZone.v1',
    root  : 'root',
    items : {
        strategy: {componentRef: 'Strategy', title: 'Strategy'},
        swarm   : {componentRef: 'Swarm', title: 'Swarm'},
        terminal: {componentRef: 'Terminal', title: 'Terminal'}
    },
    nodes: {
        root: {
            type       : 'split',
            orientation: 'horizontal',
            children   : ['main-tabs', 'terminal-tabs'],
            sizes      : [0.7, 0.3]
        },
        'main-tabs': {
            type        : 'tabs',
            items       : ['strategy', 'swarm'],
            activeItemId: 'strategy'
        },
        'terminal-tabs': {
            type        : 'tabs',
            items       : ['terminal'],
            activeItemId: 'terminal'
        }
    }
});

const createAnimationEvent = (type, targetId) => ({
    target: {id: targetId},
    type
});

/**
 * Finds one projected dock-node config across split/edge container nesting.
 * @param {Object} config
 * @param {String} nodeId
 * @returns {Object|null}
 */
const findProjectedNode = (config, nodeId) => {
    if (config?.dockNodeId === nodeId) {
        return config
    }

    for (const item of config?.items || []) {
        const match = findProjectedNode(item, nodeId);

        if (match) {
            return match
        }
    }

    return null
};

test.describe('Neo.dashboard.DockTabEnterButton', () => {
    let buttons = [];

    test.afterEach(() => {
        buttons.reverse().forEach(button => !button.isDestroyed && button.destroy());
        buttons = [];
        DockMotionSignal.activeMotions.clear()
    });

    const createButton = id => {
        let button = Neo.create(DockTabEnterButton, {id, text: id});

        buttons.push(button);
        return button
    };

    test('brackets a real root start/end, stays inert at zero duration, and filters bubbled child animations', () => {
        let button = createButton('dock-tab-enter-normal'),
            rootId = button.vdom?.id || button.id;

        // Construction/class correlation alone is not motion. A 0ms token emits no start/end,
        // leaving this path honestly signal-free.
        expect(DockMotionSignal.isAnimating(button.id)).toBe(false);

        button.onTabEnterAnimationStart(createAnimationEvent('animationstart', 'tab-enter-child'));
        expect(DockMotionSignal.isAnimating(button.id)).toBe(false);
        button.onTabEnterAnimationStart(createAnimationEvent('animationstart', rootId));
        expect(DockMotionSignal.isAnimating(button.id)).toBe(true);
        expect(button.cls).toContain(DockMotionSignal.SIGNAL_CLS);
        button.onTabEnterAnimationSettle(createAnimationEvent('animationend', 'tab-enter-child'));
        expect(DockMotionSignal.isAnimating(button.id)).toBe(true);

        button.onTabEnterAnimationSettle(createAnimationEvent('animationend', rootId));
        expect(DockMotionSignal.isAnimating(button.id)).toBe(false);

        // A duplicate end is idempotent. Cancellation balances a second real start.
        button.onTabEnterAnimationSettle(createAnimationEvent('animationend', rootId));
        button = createButton('dock-tab-enter-cancel');
        button.onTabEnterAnimationStart(createAnimationEvent('animationstart', button.vdom?.id || button.id));
        button.onTabEnterAnimationSettle(createAnimationEvent('animationcancel', button.vdom?.id || button.id));
        expect(DockMotionSignal.isAnimating(button.id)).toBe(false)
    });

    test('rapid replacement and destroy settle only each instance-owned entry', () => {
        let first  = createButton('dock-tab-enter-first'),
            second = createButton('dock-tab-enter-second');

        first.onTabEnterAnimationStart(createAnimationEvent('animationstart', first.vdom?.id || first.id));
        second.onTabEnterAnimationStart(createAnimationEvent('animationstart', second.vdom?.id || second.id));

        expect(DockMotionSignal.isAnimating(first.id)).toBe(true);
        expect(DockMotionSignal.isAnimating(second.id)).toBe(true);

        first.destroy();
        expect(DockMotionSignal.isAnimating(first.id)).toBe(false);
        expect(DockMotionSignal.isAnimating(second.id)).toBe(true);

        second.destroy();
        expect(DockMotionSignal.isAnimating(second.id)).toBe(false);
        expect(DockMotionSignal.activeMotions.size).toBe(0)
    });

    test('the refresh owner captures a real addTab for one projection only; reorder and later refreshes stay inert', async () => {
        let initial    = createModel(),
            descriptor = {operation: 'addTab', itemId: 'terminal', tabsNodeId: 'main-tabs', index: 2},
            inserted   = DockZoneModel.applyOperation(initial, descriptor),
            refreshes  = [],
            context    = {
                applyDockZoneOperation() {},
                dockModel                       : initial,
                getTabInsertProjectionDescriptor: MainContainer.prototype.getTabInsertProjectionDescriptor,
                isDestroyed                     : false,
                onDockCrossZoneDrop() {},
                onDockZoneDocumentChange: MainContainer.prototype.onDockZoneDocumentChange,
                refreshDockWorkspace    : transient => refreshes.push(transient),
                timeout                 : () => Promise.resolve()
            };

        expect(inserted.errors).toEqual([]);

        MainContainer.prototype.onDockZoneDocumentChange.call(context, inserted.document, descriptor);
        await Promise.resolve();

        expect(refreshes).toEqual([{operation: 'addTab', itemId: 'terminal', tabsNodeId: 'main-tabs'}]);
        expect(JSON.stringify(context.dockModel)).not.toContain('tabInsert');

        const projected = MainContainer.prototype.projectDockModel.call(context, refreshes[0]),
              mainTabs  = findProjectedNode(projected, 'main-tabs'),
              entered   = mainTabs.items.filter(item => item.header?.cls?.includes('neo-dashboard-dock-tab-enter'));

        expect(entered).toHaveLength(1);
        expect(entered[0].data.dockItemId).toBe('terminal');
        expect(entered[0].header.module).toBe(DockTabEnterButton);

        // Same-target addTab is a reorder: the header existed before the commit, so no insertion.
        let reorder = {operation: 'addTab', itemId: 'terminal', tabsNodeId: 'main-tabs', index: 0},
            moved   = DockZoneModel.applyOperation(context.dockModel, reorder);

        MainContainer.prototype.onDockZoneDocumentChange.call(context, moved.document, reorder);
        await Promise.resolve();
        expect(refreshes[1]).toBeNull();

        // A later coarse projection receives no captured descriptor and recreates every header inert.
        const later     = MainContainer.prototype.projectDockModel.call(context),
              laterTabs = findProjectedNode(later, 'main-tabs');

        expect(laterTabs.items.some(item => item.header?.cls?.includes('neo-dashboard-dock-tab-enter'))).toBe(false)
    });
});
