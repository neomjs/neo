import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockTabEnterButtonTest'
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import DockMotionSignal   from '../../../../src/dashboard/dock/projection/MotionSignal.mjs';
import DockTabEnterButton from '../../../../src/dashboard/dock/interaction/TabEnterButton.mjs';
import Operations         from '../../../../src/dashboard/dock/model/Operations.mjs';
import DockWorkspace      from '../../../../src/dashboard/dock/Workspace.mjs';

const createModel = () => ({
    schema: 'neo.dock.zone.v1',
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

test.describe('Neo.dashboard.dock.interaction.TabEnterButton', () => {
    let buttons = [];

    test.afterEach(() => {
        buttons.reverse().forEach(button => !button.isDestroyed && button.destroy());
        buttons = [];
        DockMotionSignal.activeMotions.clear()
    });

    const createButton = (id, config={}) => {
        let button = Neo.create(DockTabEnterButton, {...config, id, text: id});

        buttons.push(button);
        return button
    };

    test('recognizes only the exact rendered non-zero tab-entry animation', () => {
        expect(DockTabEnterButton.hasRenderedTabEnterMotion({
            'animation-duration': '0.26s',
            'animation-name'    : 'neo-dock-tab-enter'
        })).toBe(true);
        expect(DockTabEnterButton.hasRenderedTabEnterMotion({
            'animation-duration': '120ms, 0.26s',
            'animation-name'    : 'other, neo-dock-tab-enter'
        })).toBe(true);
        expect(DockTabEnterButton.hasRenderedTabEnterMotion({
            'animation-duration': '0s',
            'animation-name'    : 'neo-dock-tab-enter'
        })).toBe(false);
        expect(DockTabEnterButton.hasRenderedTabEnterMotion({
            'animation-duration': '0.26s',
            'animation-name'    : 'other'
        })).toBe(false);
        expect(DockTabEnterButton.hasRenderedTabEnterMotion(null)).toBe(false)
    });

    test('brackets a real root settle, stays idempotent, and filters bubbled child animations', () => {
        let button = createButton('dock-tab-enter-normal', {
                cls: ['stable-header', 'neo-dashboard-dock-tab-enter', 'dock-tab-enter-item-swarm']
            }),
            rootId = button.vdom?.id || button.id;

        // Construction/class correlation alone is not motion. Rendered-style discovery owns entry;
        // this test drives the already-validated non-zero branch directly.
        expect(DockMotionSignal.isAnimating(button.id)).toBe(false);

        button.beginTabEnterMotion();
        expect(DockMotionSignal.isAnimating(button.id)).toBe(true);
        expect(button.cls).toContain(DockMotionSignal.SIGNAL_CLS);
        button.onTabEnterAnimationSettle(createAnimationEvent('animationend', 'tab-enter-child'));
        expect(DockMotionSignal.isAnimating(button.id)).toBe(true);
        expect(button.hasTabEnterDecoration()).toBe(true);

        button.onTabEnterAnimationSettle(createAnimationEvent('animationend', rootId));
        expect(DockMotionSignal.isAnimating(button.id)).toBe(false);
        expect(button.hasTabEnterDecoration()).toBe(false);
        expect(button.cls).toContain('stable-header');
        expect(button.cls.some(cls => cls.startsWith('dock-tab-enter-item-'))).toBe(false);

        // A duplicate end is idempotent. Cancellation balances a second real start.
        button.onTabEnterAnimationSettle(createAnimationEvent('animationend', rootId));
        button = createButton('dock-tab-enter-cancel', {
            cls: ['neo-dashboard-dock-tab-enter', 'dock-tab-enter-item-terminal']
        });
        button.beginTabEnterMotion();
        button.onTabEnterAnimationSettle(createAnimationEvent('animationcancel', button.vdom?.id || button.id));
        expect(DockMotionSignal.isAnimating(button.id)).toBe(false);
        expect(button.hasTabEnterDecoration()).toBe(false);
        expect(button.cls.some(cls => cls.startsWith('dock-tab-enter-item-'))).toBe(false)
    });

    test('rapid replacement and destroy settle only each instance-owned entry', () => {
        let first  = createButton('dock-tab-enter-first'),
            second = createButton('dock-tab-enter-second');

        first.beginTabEnterMotion();
        second.beginTabEnterMotion();

        expect(DockMotionSignal.isAnimating(first.id)).toBe(true);
        expect(DockMotionSignal.isAnimating(second.id)).toBe(true);

        first.destroy();
        expect(DockMotionSignal.isAnimating(first.id)).toBe(false);
        expect(DockMotionSignal.isAnimating(second.id)).toBe(true);

        second.destroy();
        expect(DockMotionSignal.isAnimating(second.id)).toBe(false);
        expect(DockMotionSignal.activeMotions.size).toBe(0)
    });

    test('the refresh owner captures a globally absent addTab once; moves, reorders and later refreshes stay inert', async () => {
        let initial    = createModel(),
            descriptor = {operation: 'addTab', itemId: 'terminal', tabsNodeId: 'main-tabs', index: 2},
            moved      = Operations.applyOperation(initial, descriptor),
            detached   = Operations.applyOperation(initial, {operation: 'detachItem', itemId: 'terminal'}),
            inserted   = Operations.applyOperation(detached.document, descriptor),
            refreshes  = [],
            // a duck-typed refresh owner borrowing the engine class's commit loop: the members the
            // loop consults are supplied explicitly; the refresh spy records the one-use correlation
            context    = {
                applyDockZoneOperation() {},
                decorateFlipMarker              : DockWorkspace.prototype.decorateFlipMarker,
                dockModel                       : detached.document,
                dockProjectionConfig            : null,
                flipMarkerPrefix                : 'dock-flip-item-',
                getDockProjectionOptions        : () => ({}),
                getPaneHeaderText               : DockWorkspace.prototype.getPaneHeaderText,
                getRefreshOptions               : () => ({}),
                getTabInsertProjectionDescriptor: DockWorkspace.prototype.getTabInsertProjectionDescriptor,
                isDestroyed                     : false,
                onDockActiveIndexChange() {},
                onDockHeaderAction() {},
                onDockCrossZoneDrop() {},
                onDockZoneDocumentChange: DockWorkspace.prototype.onDockZoneDocumentChange,
                refreshDockWorkspace    : transient => refreshes.push(transient),
                resolvePane             : DockWorkspace.prototype.resolvePane,
                resolveProjectedPane    : DockWorkspace.prototype.resolveProjectedPane,
                resolveRevealPane       : DockWorkspace.prototype.resolveRevealPane,
                timeout                 : () => Promise.resolve()
            };

        expect(moved.errors).toEqual([]);
        expect(DockWorkspace.prototype.getTabInsertProjectionDescriptor.call(
            {dockModel: initial}, moved.document, descriptor
        )).toBeNull();
        expect(detached.errors).toEqual([]);
        expect(inserted.errors).toEqual([]);

        DockWorkspace.prototype.onDockZoneDocumentChange.call(context, inserted.document, descriptor);
        await context.refreshPromise;

        expect(refreshes).toEqual([{operation: 'addTab', itemId: 'terminal', tabsNodeId: 'main-tabs'}]);
        expect(JSON.stringify(context.dockModel)).not.toContain('tabInsert');

        const projected = DockWorkspace.prototype.projectDockModel.call(context, refreshes[0]),
              mainTabs  = findProjectedNode(projected, 'main-tabs'),
              entered   = mainTabs.items.filter(item => item.header?.cls?.includes('neo-dashboard-dock-tab-enter'));

        expect(entered).toHaveLength(1);
        expect(entered[0].data.dockItemId).toBe('terminal');
        expect(entered[0].header.module).toBe(DockTabEnterButton);

        // Same-target addTab is a reorder: the header existed before the commit, so no insertion.
        let reorder   = {operation: 'addTab', itemId: 'terminal', tabsNodeId: 'main-tabs', index: 0},
            reordered = Operations.applyOperation(context.dockModel, reorder);

        DockWorkspace.prototype.onDockZoneDocumentChange.call(context, reordered.document, reorder);
        await context.refreshPromise;
        expect(refreshes[1]).toBeNull();

        // A later projection receives no captured descriptor and keeps or creates every header inert.
        const later     = DockWorkspace.prototype.projectDockModel.call(context),
              laterTabs = findProjectedNode(later, 'main-tabs');

        expect(laterTabs.items.some(item => item.header?.cls?.includes('neo-dashboard-dock-tab-enter'))).toBe(false)
    });
});
