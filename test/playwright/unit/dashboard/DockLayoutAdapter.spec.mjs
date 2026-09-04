import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockLayoutAdapterTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs'; // defines Neo.get — the container child-add path resolves parents through it
import Component          from '../../../../src/component/Base.mjs';
import DockLayoutAdapter  from '../../../../src/dashboard/dock/projection/LayoutAdapter.mjs';
import DockRail           from '../../../../src/dashboard/dock/interaction/Rail.mjs';
import DockSplitter       from '../../../../src/dashboard/dock/interaction/DockSplitter.mjs';
import DockTabEnterButton from '../../../../src/dashboard/dock/interaction/TabEnterButton.mjs';
import Operations         from '../../../../src/dashboard/dock/model/Operations.mjs';
import '../../../../src/dashboard/Panel.mjs'; // registers the `dashboard-panel` ntype the projected items use
import TabContainer      from '../../../../src/tab/Container.mjs';
import TabOverflowPlugin from '../../../../src/tab/plugin/Overflow.mjs';

const createModel = () => ({
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        strategy: {
            componentRef: 'strategy',
            title       : 'Strategy',
            kind        : 'panel'
        },
        swarm: {
            componentRef: 'swarm',
            title       : 'Swarm',
            kind        : 'panel'
        },
        terminal: {
            componentRef: 'terminal',
            title       : 'Terminal',
            kind        : 'terminal'
        },
        missing: {
            componentRef: 'missing',
            title       : 'Missing',
            kind        : 'panel'
        }
    },
    nodes: {
        root: {
            type       : 'split',
            orientation: 'horizontal',
            children   : ['main-tabs', 'side-split'],
            sizes      : [0.7, 0.3]
        },
        'main-tabs': {
            type        : 'tabs',
            items       : ['strategy', 'swarm'],
            activeItemId: 'swarm'
        },
        'side-split': {
            type       : 'split',
            orientation: 'vertical',
            children   : ['terminal-tabs', 'missing-tabs'],
            sizes      : [0.55, 0.45]
        },
        'terminal-tabs': {
            type        : 'tabs',
            items       : ['terminal'],
            activeItemId: 'terminal'
        },
        'missing-tabs': {
            type        : 'tabs',
            items       : ['missing'],
            activeItemId: 'missing'
        }
    }
});

const createEdgeZoneModel = () => ({
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        strategy: {
            componentRef: 'strategy',
            title       : 'Strategy',
            kind        : 'panel'
        },
        swarm: {
            componentRef: 'swarm',
            title       : 'Swarm',
            kind        : 'panel'
        },
        terminal: {
            componentRef: 'terminal',
            title       : 'Terminal',
            kind        : 'terminal'
        },
        inspector: {
            componentRef: 'inspector',
            title       : 'Inspector',
            kind        : 'inspector'
        }
    },
    nodes: {
        root: {
            type : 'edge-zone',
            zones: {
                center: {nodeId: 'main-tabs'},
                right : {nodeId: 'side-split', extent: 0.3, resizable: true}
            }
        },
        'main-tabs': {
            type        : 'tabs',
            items       : ['strategy', 'swarm'],
            activeItemId: 'swarm'
        },
        'side-split': {
            type       : 'split',
            orientation: 'vertical',
            children   : ['terminal-tabs', 'inspector-tabs'],
            sizes      : [0.55, 0.45]
        },
        'terminal-tabs': {
            type        : 'tabs',
            items       : ['terminal'],
            activeItemId: 'terminal'
        },
        'inspector-tabs': {
            type        : 'tabs',
            items       : ['inspector'],
            activeItemId: 'inspector'
        }
    }
});

const getProjectedChildren = splitConfig => splitConfig.items.filter(item => item.dockNodeType !== 'splitter');

/**
 * Edge-zone model whose right zone is a TABS node directly (the FM cockpit's secondary-rail
 * shape): both band items start auto-hidden, so the band's projected tab flow is empty and
 * only the rail carries them.
 * @returns {Object}
 */
const createTabsBandModel = () => ({
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        strategy: {componentRef: 'strategy', title: 'Strategy', kind: 'panel'},
        detail  : {componentRef: 'detail',   title: 'Detail',   kind: 'inspector', autoHidden: true},
        operator: {componentRef: 'operator', title: 'Operator', kind: 'tool',      autoHidden: true}
    },
    nodes: {
        root       : {
            type : 'edge-zone',
            zones: {
                center: {nodeId: 'main-tabs'},
                right : {nodeId: 'tool-tabs', extent: 0.25, resizable: true}
            }
        },
        'main-tabs': {type: 'tabs', items: ['strategy'], activeItemId: 'strategy'},
        'tool-tabs': {type: 'tabs', items: ['detail', 'operator'], activeItemId: 'detail'}
    }
});

const getProjectedSplitters = splitConfig => splitConfig.items.filter(item => item.dockNodeType === 'splitter');

/**
 * Every projected tabs node anywhere in a projection, keyed by its `dockNodeId` — so a test can
 * address one tabs header without hand-walking the row/band/split nesting that surrounds it.
 * @param {Object} config
 * @returns {Map<String,Object>}
 */
const collectProjectedTabsById = config => {
    const found = new Map();

    (function walk(node) {
        if (!node || typeof node !== 'object') return;

        node.dockNodeType === 'tabs' && found.set(node.dockNodeId, node);
        (Array.isArray(node.items) ? node.items : []).forEach(walk)
    })(config);

    return found
};

test.describe('Neo.dashboard.dock.projection.LayoutAdapter', () => {
    test('projects split nodes to existing hbox and vbox layout primitives', () => {
        let model  = createModel(),
            result = DockLayoutAdapter.project(model, {
                resolveComponentRef: componentRef => componentRef === 'missing' ? null : {
                    ntype    : 'dashboard-panel',
                    reference: componentRef
                }
            }),
            rootChildren = getProjectedChildren(result),
            sideSplit    = rootChildren[1],
            sideChildren = getProjectedChildren(sideSplit);

        expect(result.ntype).toBe('container');
        expect(result.layout).toEqual({ntype: 'hbox', align: 'stretch'});
        expect(rootChildren.map(item => item.flex)).toEqual([0.7, 0.3]);

        expect(sideSplit.layout).toEqual({ntype: 'vbox', align: 'stretch'});
        expect(sideChildren.map(item => item.flex)).toEqual([0.55, 0.45]);
    });

    test('projects the stable default Dock action rail and keeps capability in action state', () => {
        const
            model       = createModel(),
            resolvePane = componentRef => ({ntype: 'dashboard-panel', reference: componentRef}),
            hidden      = getProjectedChildren(DockLayoutAdapter.project(model, {
                enableDockMaximizeAction: true,
                resolveComponentRef     : resolvePane
            }))[0],
            available   = getProjectedChildren(DockLayoutAdapter.project(model, {
                dockPopOutActionAvailable: true,
                enableDockMaximizeAction : true,
                resolveComponentRef      : resolvePane
            }))[0],
            optedOut   = getProjectedChildren(DockLayoutAdapter.project(model, {
                enableDockCloseAction   : false,
                enableDockMaximizeAction: false,
                enableDockPinAction     : false,
                enableDockPopOutAction  : false,
                enableDockReloadAction  : false,
                resolveComponentRef     : resolvePane
            }))[0];

        expect(hidden.headerActions.map(action => action.action))
            .toEqual(['reload', 'pin', 'pop-out', 'maximize', 'close']);
        expect(hidden.headerActions.some(action => action.action === 'lock')).toBe(false);
        expect(hidden.headerActions.find(action => action.action === 'reload').hidden).toBe(true);
        expect(hidden.headerActions.find(action => action.action === 'pop-out').hidden).toBe(true);
        expect(hidden.headerActions.find(action => action.action === 'pin')).toMatchObject({
            iconCls: 'fa fa-thumbtack-slash',
            vdom   : {'aria-label': 'unpin'}
        });
        expect(hidden.headerActions.slice(0, -1).every(action => action.contextual === undefined)).toBe(true);
        expect(hidden.headerActions.at(-1)).toMatchObject({action: 'close', contextual: false});
        expect(hidden.vdom.tabIndex).toBe(-1);

        expect(available.headerActions.map(action => action.action))
            .toEqual(['reload', 'pin', 'pop-out', 'maximize', 'close']);
        expect(available.headerActions.find(action => action.action === 'pop-out').hidden).toBe(false);

        expect(optedOut.headerActions, 'explicit false retains the public compatibility escape').toBeUndefined();
        expect(optedOut.vdom).toBeUndefined()
    });

    test('the maximize toggle is opt-in: a workspace maximize plugin contributes it, nothing else does', () => {
        const
            model       = createModel(),
            resolvePane = componentRef => ({ntype: 'dashboard-panel', reference: componentRef}),
            absent      = getProjectedChildren(DockLayoutAdapter.project(model, {
                resolveComponentRef: resolvePane
            }))[0],
            hostOwned   = getProjectedChildren(DockLayoutAdapter.project(model, {
                resolveComponentRef     : resolvePane,
                resolveDockHeaderActions: () => [{action: 'maximize', iconCls: 'fa fa-expand'}]
            }))[0];

        expect(absent.headerActions.map(action => action.action))
            .toEqual(['reload', 'pin', 'pop-out', 'close']);
        expect(hostOwned.headerActions.filter(action => action.action === 'maximize'),
            'without the flag the name is the host\'s to take').toHaveLength(1)
    });

    test('routes default-rail and active-index intents through the tabs-node owner', () => {
        const
            model         = createModel(),
            intents       = [],
            activeChanges = [],
            projected     = DockLayoutAdapter.project(model, {
                onDockActiveIndexChange: data => activeChanges.push(data),
                onDockHeaderAction     : data => intents.push(data),
                resolveComponentRef    : componentRef => ({ntype: 'dashboard-panel', reference: componentRef})
            }),
            main          = getProjectedChildren(projected)[0],
            tabContainer  = {id: 'live-tabs'};

        main.listeners.headerAction({action: 'custom', tabContainer});
        main.listeners.headerAction({action: 'close', tabContainer});
        main.listeners.activeIndexChange({item: {id: 'live-card'}, value: 0});

        expect(intents).toEqual([
            {action: 'custom', dockNodeId: 'main-tabs', tabContainer},
            {action: 'close',  dockNodeId: 'main-tabs', tabContainer}
        ]);
        expect(activeChanges).toEqual([{dockNodeId: 'main-tabs', item: {id: 'live-card'}, tabContainer: null, value: 0}])
    });

    test('projects host actions before the default rail and keeps close persistent and last', () => {
        const
            model       = createModel(),
            intents     = [],
            seenNodeIds = [],
            resolvePane = componentRef => ({ntype: 'dashboard-panel', reference: componentRef}),
            projected   = DockLayoutAdapter.project(model, {
                enableDockMaximizeAction: true,
                onDockHeaderAction      : data => intents.push(data),
                resolveComponentRef     : resolvePane,
                resolveDockHeaderActions: nodeId => {
                    seenNodeIds.push(nodeId);
                    return nodeId === 'main-tabs' ? [{action: 'filter', iconCls: 'fa fa-filter'}] : []
                }
            }),
            main        = getProjectedChildren(projected)[0],
            tabContainer = {id: 'live-tabs'};

        expect(main.headerActions.map(action => action.action))
            .toEqual(['filter', 'reload', 'pin', 'pop-out', 'maximize', 'close']);
        expect(main.headerActions[0].contextual).toBeUndefined();
        expect(main.headerActions.at(-1).contextual).toBe(false);
        expect(new Set(seenNodeIds).size, 'asked once per node, not once per item').toBe(seenNodeIds.length);

        main.listeners.headerAction({action: 'filter', tabContainer});
        expect(intents).toEqual([{action: 'filter', dockNodeId: 'main-tabs', tabContainer}])
    });

    test('reserves every default action name and keeps lock reservation opt-in', () => {
        const
            model       = createModel(),
            resolvePane = componentRef => ({ntype: 'dashboard-panel', reference: componentRef}),
            project     = (actions, extra={}) => () => DockLayoutAdapter.project(model, {
                enableDockMaximizeAction: true,
                resolveComponentRef     : resolvePane,
                resolveDockHeaderActions: () => actions,
                ...extra
            });

        expect(project([{action: 'filter'}, {action: 'filter'}])).toThrow(/duplicate host header action "filter"/);
        expect(project([{iconCls: 'fa fa-x'}])).toThrow(/requires a semantic `action` name/);

        const defaultFlags = {
            close    : 'enableDockCloseAction',
            maximize : 'enableDockMaximizeAction',
            pin      : 'enableDockPinAction',
            'pop-out': 'enableDockPopOutAction',
            reload   : 'enableDockReloadAction'
        };

        for (const [name, flag] of Object.entries(defaultFlags)) {
            expect(project([{action: name}])).toThrow(new RegExp(`"${name}" is reserved by ${flag}`));

            const hostOwned = collectProjectedTabsById(project([{action: name}], {[flag]: false})())
                .get('main-tabs');

            expect(hostOwned.headerActions.filter(action => action.action === name),
                `explicit false frees ${name} for the host`).toHaveLength(1)
        }

        const hostLock = collectProjectedTabsById(project([{action: 'lock'}])()).get('main-tabs');

        expect(hostLock.headerActions.map(action => action.action))
            .toEqual(['lock', 'reload', 'pin', 'pop-out', 'maximize', 'close']);
        expect(project([{action: 'lock'}], {enableDockLockAction: true}))
            .toThrow(/"lock" is reserved by enableDockLockAction/);

        const prototypeName = collectProjectedTabsById(project([{action: 'constructor'}])()).get('main-tabs');

        expect(prototypeName.headerActions.map(action => action.action))
            .toEqual(['constructor', 'reload', 'pin', 'pop-out', 'maximize', 'close'])
    });

    test('pin and pop-out keep stable slots while capability and policy change their state', () => {
        const model = createEdgeZoneModel();

        model.items.inspector.pinnable = false;

        const
            resolvePane = componentRef => ({ntype: 'dashboard-panel', reference: componentRef}),
            result      = DockLayoutAdapter.project(model, {
                dockPopOutActionAvailable: true,
                enableDockMaximizeAction : true,
                resolveComponentRef      : resolvePane,
                resolveDockHeaderActions : nodeId => nodeId === 'terminal-tabs' ? [{action: 'diagnose'}] : []
            }),
            tabs          = collectProjectedTabsById(result),
            centerTab     = tabs.get('main-tabs'),
            terminalTabs  = tabs.get('terminal-tabs'),
            inspectorTabs = tabs.get('inspector-tabs');

        // The frozen order, with a host action present: host actions, then the engine set, then close.
        expect(terminalTabs.headerActions.map(action => action.action))
            .toEqual(['diagnose', 'reload', 'pin', 'pop-out', 'maximize', 'close']);
        expect(centerTab.headerActions.map(action => action.action))
            .toEqual(['reload', 'pin', 'pop-out', 'maximize', 'close']);

        // Right-band-owned, pinnable, active — the one case where the gesture can complete.
        expect(terminalTabs.headerActions.find(action => action.action === 'pin'))
            .toMatchObject({action: 'pin', hidden: false});
        expect(terminalTabs.headerActions.find(action => action.action === 'pop-out').hidden).toBe(false);

        // Focus-gated like a host action, NOT like close. `close` opts out with `contextual: false`
        // because it must stay reachable on an unfocused pane; the engine set inherits the tab
        // header's `showOnFocus` default, and carrying close's opt-out would leave a permanently
        // visible control on every header.
        expect(terminalTabs.headerActions.find(action => action.action === 'pin').contextual,
            'pin inherits the header focus gate').toBeUndefined();
        expect(terminalTabs.headerActions[0].contextual, 'the host action is gated too').toBeUndefined();
        expect(terminalTabs.headerActions.at(-1).contextual, 'close is the one deliberate exemption').toBe(false);

        // Center-owned: §2.7 never rails main content, so the affordance must not offer it.
        expect(centerTab.headerActions.find(action => action.action === 'pin').hidden,
            'a center-owned active item cannot collapse').toBe(true);

        // Policy-refused: `setItemAutoHidden` rejects `pinnable: false`, so offering it would be a lie.
        expect(inspectorTabs.headerActions.find(action => action.action === 'pin').hidden).toBe(true);

        const noPopOut = collectProjectedTabsById(DockLayoutAdapter.project(model, {
            resolveComponentRef: resolvePane
        })).get('terminal-tabs');

        expect(noPopOut.headerActions.find(action => action.action === 'pop-out').hidden).toBe(true)
    });

    test('threads the maximize icon and routes its default-rail intent', () => {
        const
            model       = createModel(),
            intents     = [],
            resolvePane = componentRef => ({ntype: 'dashboard-panel', reference: componentRef}),
            projected   = DockLayoutAdapter.project(model, {
                dockMaximizeIconCls     : 'fa fa-expand',
                enableDockMaximizeAction: true,
                onDockHeaderAction      : data => intents.push(data),
                resolveComponentRef     : resolvePane
            }),
            main        = getProjectedChildren(projected)[0],
            maximize    = main.headerActions.find(action => action.action === 'maximize');

        expect(maximize.contextual).toBeUndefined();
        expect(maximize.iconCls).toBe('fa fa-expand');

        // Intent arrives like any other action, with its tabs node identified.
        const tabContainer = {id: 'live-tabs'};

        main.listeners.headerAction({action: 'maximize', tabContainer});
        expect(intents).toEqual([{action: 'maximize', dockNodeId: 'main-tabs', tabContainer}])
    });

    test('keeps lock opt-in ahead of the stable default rail', () => {
        const
            model       = createModel(),
            resolvePane = componentRef => ({ntype: 'dashboard-panel', reference: componentRef}),
            enabled     = DockLayoutAdapter.project(model, {
                enableDockLockAction    : true,
                enableDockMaximizeAction: true,
                resolveComponentRef     : resolvePane
            }),
            enabledMain = getProjectedChildren(enabled)[0];

        expect(enabledMain.headerActions.map(action => action.action))
            .toEqual(['lock', 'reload', 'pin', 'pop-out', 'maximize', 'close']);

        expect(enabledMain.headerActions[1].contextual).toBeUndefined();
        expect(enabledMain.headerActions[1].hidden).toBe(true);
        expect(enabledMain.headerActions[1].iconCls).toBe('fa fa-rotate-right');
    });

    test('split children release the flexbox min-content floor: committed sizes stay the sole geometry authority', () => {
        let result = DockLayoutAdapter.project(createModel(), {
                resolveComponentRef: componentRef => ({
                    ntype    : 'dashboard-panel',
                    reference: componentRef
                })
            }),
            rootChildren = getProjectedChildren(result),
            sideChildren = getProjectedChildren(rootChildren[1]);

        // without the release, a zone's min-content height/width caps the flex
        // distribution and the rendered split silently deviates from the document —
        // every DIRECT split child (tabs zones AND nested splits) carries the release
        [...rootChildren, ...sideChildren].forEach(child => {
            expect(child.style.minHeight).toBe(0);
            expect(child.style.minWidth).toBe(0)
        })
    });

    test('projects resize splitter affordances between adjacent split children', () => {
        let result = DockLayoutAdapter.project(createModel(), {
                resolveComponentRef: componentRef => ({
                    ntype    : 'dashboard-panel',
                    reference: componentRef
                })
            }),
            rootSplitter = getProjectedSplitters(result)[0],
            sideSplit    = getProjectedChildren(result)[1],
            sideSplitter = getProjectedSplitters(sideSplit)[0];

        expect(result.items.map(item => item.dockNodeType)).toEqual(['tabs', 'splitter', 'split']);
        expect(rootSplitter).toMatchObject({
            dockNodeId            : 'root',
            dockNodeType          : 'splitter',
            dockSplitBoundaryIndex: 0,
            dockSplitOrientation  : 'horizontal',
            module                : DockSplitter,
            ntype                 : 'dashboard-dock-splitter',
            orientation           : 'horizontal',
            size                  : DockLayoutAdapter.splitterSize,
            splitNodeId           : 'root',
            width                 : DockLayoutAdapter.splitterSize
        });
        expect(rootSplitter.height).toBeUndefined();
        expect(rootSplitter.data).toMatchObject({
            boundaryIndex: 0,
            dockSplitter : true,
            operation    : 'resizeSplit',
            orientation  : 'horizontal',
            splitNodeId  : 'root'
        });

        expect(sideSplit.items.map(item => item.dockNodeType)).toEqual(['tabs', 'splitter', 'tabs']);
        expect(sideSplitter).toMatchObject({
            dockNodeId            : 'side-split',
            dockNodeType          : 'splitter',
            dockSplitBoundaryIndex: 0,
            dockSplitOrientation  : 'vertical',
            height                : DockLayoutAdapter.splitterSize,
            module                : DockSplitter,
            ntype                 : 'dashboard-dock-splitter',
            orientation           : 'vertical',
            size                  : DockLayoutAdapter.splitterSize,
            splitNodeId           : 'side-split'
        });
        expect(sideSplitter.width).toBeUndefined();
    });

    test('creates resizeSplit operation descriptors from splitter affordance metadata', () => {
        let model  = createModel(),
            result = DockLayoutAdapter.project(model, {
                resolveComponentRef: componentRef => ({
                    ntype    : 'dashboard-panel',
                    reference: componentRef
                })
            }),
            sizes    = [3, 1],
            splitter = getProjectedSplitters(result)[0],
            descriptor,
            resized;

        descriptor = DockLayoutAdapter.createResizeSplitOperation(splitter, sizes);
        sizes[0]   = 1;

        expect(descriptor).toEqual({
            operation  : 'resizeSplit',
            sizes      : [3, 1],
            splitNodeId: 'root'
        });

        resized = Operations.applyOperation(model, descriptor);

        expect(resized.errors).toEqual([]);
        expect(resized.document.nodes.root.sizes).toEqual([0.75, 0.25]);
        expect(model.nodes.root.sizes).toEqual([0.7, 0.3]);
    });

    test('projects tab nodes to tab.Container-compatible configs', () => {
        let result = DockLayoutAdapter.project(createModel(), {
            resolveComponentRef: componentRef => ({
                ntype    : 'dashboard-panel',
                reference: componentRef
            })
        });

        expect(result.items[0].ntype).toBe('tab-container');
        expect(result.items[0].activeIndex).toBe(1);
        expect(result.items[0].items.map(item => item.header.text)).toEqual(['Strategy', 'Swarm']);
        expect(result.items[0].items.map(item => item.data.dockItemId)).toEqual(['strategy', 'swarm']);
    });

    test('the dockItemId stamp reaches header CONFIGS and live header BUTTONS, order-agnostic (#15517)', () => {
        let result = DockLayoutAdapter.project(createModel(), {
            resolveComponentRef: componentRef => componentRef === 'missing' ? null : ({
                ntype    : 'dashboard-panel',
                reference: componentRef
            })
        });

        // config level: resolver-returned plain configs carry the stamp in their header
        expect(result.items[0].items.map(item => item.header.dockItemId)).toEqual(['strategy', 'swarm']);

        // the placeholder path (absent resolver) carries it too — locate by the stamped node id,
        // agnostic to the interleaved splitter positions
        const sideSplit   = result.items.find(item => item.dockNodeType === 'split'),
              missingTabs = sideSplit.items.find(item => item.dockNodeId === 'missing-tabs');

        expect(missingTabs.items[0].header.dockItemId).toBe('missing');

        // button level: a real tab.Container built from the projection carries the stamp on
        // every header BUTTON instance — and it follows the button, not the position
        const tabContainer = Neo.create({
            module: TabContainer,
            ...result.items[0]
        });
        let buttons = tabContainer.getTabBar().items;

        expect(buttons.map(button => button.dockItemId)).toEqual(['strategy', 'swarm']);

        // non-1:1 order: reorder the buttons — the stamp stays with ITS button
        const moved = buttons[1];

        tabContainer.getTabBar().remove(moved, false);
        tabContainer.getTabBar().insert(0, moved);
        buttons = tabContainer.getTabBar().items;

        expect(buttons[0]).toBe(moved);
        expect(buttons[0].dockItemId).toBe('swarm');
        expect(buttons[1].dockItemId).toBe('strategy');

        tabContainer.destroy()
    });

    test('a transient addTab correlation decorates only the exact target header without mutating the model', () => {
        let model    = createModel(),
            snapshot = JSON.parse(JSON.stringify(model)),
            result   = DockLayoutAdapter.project(model, {
                resolveComponentRef: componentRef => ({
                    ntype    : 'dashboard-panel',
                    reference: componentRef
                }),
                tabInsertDescriptor: {operation: 'addTab', itemId: 'swarm', tabsNodeId: 'main-tabs'}
            }),
            mainTabs = result.items[0],
            headers  = mainTabs.items.map(item => item.header);

        expect(headers[0].module).toBeUndefined();
        expect(headers[0].cls).toBeUndefined();
        expect(headers[1].module).toBe(DockTabEnterButton);
        expect(headers[1].cls).toEqual([
            'neo-dashboard-dock-tab-enter',
            'dock-tab-enter-item-swarm'
        ]);
        expect(model).toEqual(snapshot);

        const unrelated = DockLayoutAdapter.project(model, {
            resolveComponentRef: componentRef => ({ntype: 'dashboard-panel', reference: componentRef}),
            tabInsertDescriptor: {operation: 'addTab', itemId: 'swarm', tabsNodeId: 'terminal-tabs'}
        });

        expect(unrelated.items[0].items.every(item => item.header.module === undefined)).toBe(true)
    });

    test('an absent-item resolver can reuse the adapter-owned metadata and addTab decoration', () => {
        const
            item   = {componentRef: 'Swarm', kind: 'panel', title: 'Swarm'},
            config = DockLayoutAdapter.decorateProjectedItem(
                {ntype: 'component'},
                'swarm',
                item,
                {
                    nodeId             : 'main-tabs',
                    tabInsertDescriptor: {operation: 'addTab', itemId: 'swarm', tabsNodeId: 'main-tabs'}
                }
            );

        expect(config.dockItemId).toBe('swarm');
        expect(config.data).toEqual({componentRef: 'Swarm', dockItemId: 'swarm'});
        expect(config.header.text).toBe('Swarm');
        expect(config.header.module).toBe(DockTabEnterButton);
        expect(config.header.cls).toEqual([
            'neo-dashboard-dock-tab-enter',
            'dock-tab-enter-item-swarm'
        ])
    });

    test('projects the documented edge-zone root model through the dashboard adapter', () => {
        let result = DockLayoutAdapter.project(createEdgeZoneModel(), {
                resolveComponentRef: componentRef => ({
                    ntype    : 'dashboard-panel',
                    reference: componentRef
                })
            }),
            row    = result.items[0],
            center = row.items.find(item => item.dockNodeId === 'main-tabs'),
            right  = row.items.find(item => item.dockNodeId === 'side-split'),
            edgeSplitter = row.items.find(item => item.data?.operation === 'resizeEdgeZone'),
            rightChildren = getProjectedChildren(right);

        expect(result.dockNodeType).toBe('edge-zone');
        expect(result.layout).toEqual({ntype: 'vbox', align: 'stretch'});
        expect(row.dockNodeType).toBe('edge-zone-row');
        expect(row.layout).toEqual({ntype: 'hbox', align: 'stretch'});

        expect(center.ntype).toBe('tab-container');
        expect(center.activeIndex).toBe(1);
        expect(center.items.map(item => item.header.text)).toEqual(['Strategy', 'Swarm']);

        expect(right.layout).toEqual({ntype: 'vbox', align: 'stretch'});
        expect(right.width).toBe('30%');
        expect(rightChildren.map(item => item.flex)).toEqual([0.55, 0.45]);
        expect(rightChildren.map(item => item.items[0].data.dockItemId)).toEqual(['terminal', 'inspector']);

        expect(edgeSplitter.module).toBe(DockSplitter);
        expect(edgeSplitter.edge).toBe('right');
        expect(edgeSplitter.edgeZoneId).toBe('root');
        expect(edgeSplitter.data).toMatchObject({
            dockNodeId : 'root',
            edge       : 'right',
            edgeZoneId : 'root',
            operation  : 'resizeEdgeZone',
            orientation: 'horizontal'
        })
    });

    test('omits edge splitters when the descriptor does not opt into resizing', () => {
        let model = createEdgeZoneModel();

        model.nodes.root.zones.right.resizable = false;

        let result = DockLayoutAdapter.project(model, {
                resolveComponentRef: componentRef => ({ntype: 'dashboard-panel', reference: componentRef})
            }),
            row = result.items[0];

        expect(row.items.some(item => item.data?.operation === 'resizeEdgeZone')).toBe(false)
    });

    test('projects left, right, and bottom splitters on their center-facing boundaries', () => {
        let model = createEdgeZoneModel();

        Object.assign(model.items, {
            navigator: {componentRef: 'navigator', title: 'Navigator', kind: 'panel'},
            feed     : {componentRef: 'feed',      title: 'Feed',      kind: 'panel'}
        });
        Object.assign(model.nodes, {
            'left-tabs'  : {type: 'tabs', items: ['navigator'], activeItemId: 'navigator'},
            'bottom-tabs': {type: 'tabs', items: ['feed'],      activeItemId: 'feed'}
        });
        Object.assign(model.nodes.root.zones, {
            left  : {nodeId: 'left-tabs',   extent: 0.2,  resizable: true},
            bottom: {nodeId: 'bottom-tabs', extent: 0.25, resizable: true}
        });

        let result = DockLayoutAdapter.project(model, {
                resolveComponentRef: componentRef => ({ntype: 'dashboard-panel', reference: componentRef})
            }),
            row       = result.items.find(item => item.dockNodeType === 'edge-zone-row'),
            splitters = [...row.items, ...result.items].filter(item => item.data?.operation === 'resizeEdgeZone');

        expect(splitters.map(item => item.edge)).toEqual(['left', 'right', 'bottom']);
        expect(row.items.indexOf(row.items.find(item => item.dockNodeId === 'left-tabs')))
            .toBeLessThan(row.items.indexOf(row.items.find(item => item.edge === 'left')));
        expect(row.items.indexOf(row.items.find(item => item.edge === 'right')))
            .toBeLessThan(row.items.indexOf(row.items.find(item => item.dockNodeId === 'side-split')));
        expect(result.items.indexOf(result.items.find(item => item.edge === 'bottom')))
            .toBeLessThan(result.items.indexOf(result.items.find(item => item.dockNodeId === 'bottom-tabs')))
    });

    test('falls back to recoverable placeholders without mutating the source model', () => {
        let model    = createModel(),
            snapshot = JSON.parse(JSON.stringify(model)),
            result   = DockLayoutAdapter.project(model, {
                resolveComponentRef: componentRef => componentRef === 'missing' ? null : {
                    ntype    : 'dashboard-panel',
                    reference: componentRef
                }
            }),
            placeholder = getProjectedChildren(getProjectedChildren(result)[1])[1].items[0];

        expect(placeholder.ntype).toBe('dashboard-panel');
        expect(placeholder.data).toEqual({
            componentRef       : 'missing',
            dockItemId         : 'missing',
            missingComponentRef: true
        });
        expect(placeholder.header.text).toBe('Missing');
        expect(model).toEqual(snapshot);
    });

    test('keeps a tabs-node item absent from the catalog recoverable', () => {
        let model = createModel();

        model.nodes['missing-tabs'] = {
            type        : 'tabs',
            items       : ['unknown'],
            activeItemId: 'unknown'
        };

        let result      = DockLayoutAdapter.project(model, {resolveComponentRef: () => null}),
            placeholder = getProjectedChildren(getProjectedChildren(result)[1])[1].items[0];

        expect(placeholder.ntype).toBe('dashboard-panel');
        expect(placeholder.data).toEqual({
            componentRef       : null,
            dockItemId         : 'unknown',
            missingComponentRef: true
        });
        expect(placeholder.header.text).toBe('unknown')
    });

    test('normalizes invalid split sizes without rewriting the model', () => {
        let model = createModel();

        model.nodes.root.sizes = [0, Number.NaN];

        let result = DockLayoutAdapter.project(model, {
            resolveComponentRef: componentRef => ({
                ntype    : 'dashboard-panel',
                reference: componentRef
            })
        });

        expect(getProjectedChildren(result).map(item => item.flex)).toEqual([1, 1]);
        expect(model.nodes.root.sizes.length).toBe(2);
    });

    test('rejects preview-only fields at the adapter boundary', () => {
        let model = {
            ...createModel(),
            dockPreview: {
                previewId: 'preview-1'
            }
        };

        expect(() => DockLayoutAdapter.project(model)).toThrow(/preview-only field "dockPreview"/);
    });

    test('rejects runtime-only drag metadata from the full contract list', () => {
        let model = createModel();

        model.items.strategy.metadata = {
            sourceSortZone: 'left'
        };

        expect(() => DockLayoutAdapter.project(model)).toThrow(/preview-only field "sourceSortZone"/);
    });

    test('rejects the grouped-drag runtime-only groupNodeId at the adapter boundary', () => {
        let model = createModel();

        model.items.strategy.metadata = {
            groupNodeId: 'tabs-1'
        };

        expect(() => DockLayoutAdapter.project(model)).toThrow(/preview-only field "groupNodeId"/);
    });

    test('projects an autoHidden edge item into an edge rail and drops it from the tab flow', () => {
        let model = createEdgeZoneModel();

        model.items.terminal.autoHidden = true;

        let result = DockLayoutAdapter.project(model, {
                resolveComponentRef: componentRef => ({ntype: 'dashboard-panel', reference: componentRef})
            }),
            row  = result.items[0],
            rail = row.items.find(item => item.dockNodeType === 'edge-rail'),
            side = row.items.find(item => item.dockNodeId === 'side-split');

        // The auto-hidden item surfaces as a right-edge DockRail affordance.
        expect(rail).toBeTruthy();
        expect(rail.dockEdge).toBe('right');
        expect(rail.edge).toBe('right');
        expect(rail.flex).toBe('none');
        expect(rail.module).toBe(DockRail);
        expect(rail.ntype).toBe('dashboard-dock-rail');
        expect(rail.railItems).toEqual([
            {dockEdge: 'right', dockItemId: 'terminal', restorable: true, title: 'Terminal'}
        ]);
        // The rail's structural identity — its owning edge-zone node and its edge — is what lets the
        // reconciler key a retained rail across projections; the same document projects it twice alike.
        expect(rail.dockNodeId).toBe('root:edge-rail:right');
        expect(DockLayoutAdapter.project(model, {
            resolveComponentRef: componentRef => ({ntype: 'dashboard-panel', reference: componentRef})
        }).items[0].items.find(item => item.dockNodeType === 'edge-rail').dockNodeId).toBe(rail.dockNodeId);

        // ...and its now-empty tabs node is gone from the live split, not rendered as dead chrome.
        expect([...collectProjectedTabsById(side).keys()]).toEqual(['inspector-tabs']);

        // Geometry discipline: edge bands keep a fixed cross-extent, the center flexes.
        expect(side.flex).toBe('none');
        expect(side.cls).toEqual(expect.arrayContaining(['neo-dashboard-dock-edge-band', 'neo-dashboard-dock-edge-band-right']));
        expect(row.items[0].flex).toBe(1);
    });

    test('does not rail an item that is pinned but not autoHidden', () => {
        let model = createEdgeZoneModel();

        model.items.terminal.pinned = true;

        let result = DockLayoutAdapter.project(model, {
                resolveComponentRef: componentRef => ({ntype: 'dashboard-panel', reference: componentRef})
            }),
            row = result.items[0];

        expect(row.items.find(item => item.dockNodeType === 'edge-rail')).toBeUndefined();
    });

    test('leaves a center-zone autoHidden item in the tab flow as a fail-safe (no center rail)', () => {
        let model = createEdgeZoneModel();

        model.items.strategy.autoHidden = true;

        let result = DockLayoutAdapter.project(model, {
                resolveComponentRef: componentRef => ({ntype: 'dashboard-panel', reference: componentRef})
            }),
            row    = result.items[0],
            center = row.items[0];

        // Center never auto-hides to a rail; the item stays visible rather than vanishing.
        expect(row.items.find(item => item.dockNodeType === 'edge-rail')).toBeUndefined();
        expect(center.items.map(item => item.data.dockItemId)).toEqual(['strategy', 'swarm']);
    });

    test('an edge band whose every item is railed projects rail-only — no empty in-flow band box', () => {
        let model  = createTabsBandModel(),
            result = DockLayoutAdapter.project(model, {
                resolveComponentRef: componentRef => ({ntype: 'dashboard-panel', reference: componentRef})
            }),
            row  = result.items[0],
            band = row.items.find(item => (item.cls || []).includes('neo-dashboard-dock-edge-band')),
            rail = row.items.find(item => item.dockNodeType === 'edge-rail');

        // Every band item is auto-hidden: the tabs would project an EMPTY flow, and an empty
        // band still holding its fixed cross-extent starves the center (a dead gutter at
        // desktop; band + rail can exceed a narrow vessel's whole row). Rail-only is the
        // truthful projection.
        expect(band).toBeUndefined();
        expect(rail).toBeTruthy();
        expect(rail.railItems.map(item => item.dockItemId)).toEqual(['detail', 'operator']);

        // the row keeps exactly the flexing center + the rail
        expect(row.items.filter(item => item.dockNodeType !== 'splitter').length).toBe(2);
        expect(row.items[0].flex).toBe(1);
    });

    test('a partially-railed edge band keeps projecting: live items still own their band', () => {
        let model = createTabsBandModel();

        model.items.operator.autoHidden = false;

        let result = DockLayoutAdapter.project(model, {
                resolveComponentRef: componentRef => ({ntype: 'dashboard-panel', reference: componentRef})
            }),
            row  = result.items[0],
            band = row.items.find(item => (item.cls || []).includes('neo-dashboard-dock-edge-band')),
            rail = row.items.find(item => item.dockNodeType === 'edge-rail');

        expect(band).toBeTruthy();
        expect(band.flex).toBe('none');
        expect(band.cls).toEqual(expect.arrayContaining(['neo-dashboard-dock-edge-band', 'neo-dashboard-dock-edge-band-right']));
        expect(band.items.map(item => item.data.dockItemId)).toEqual(['operator']);

        // the railed sibling still reaches the rail
        expect(rail.railItems.map(item => item.dockItemId)).toEqual(['detail']);
    });

    test('a split edge band omits a child whose final live tab moved to the rail', () => {
        let model = createEdgeZoneModel();

        model.items.terminal.autoHidden = true;

        let result = DockLayoutAdapter.project(model, {
                resolveComponentRef: componentRef => ({ntype: 'dashboard-panel', reference: componentRef})
            }),
            row  = result.items[0],
            band = row.items.find(item => (item.cls || []).includes('neo-dashboard-dock-edge-band')),
            rail = row.items.find(item => item.dockNodeType === 'edge-rail');

        // The committed split remains model truth, but a child with zero live tabs has no in-flow
        // representation. Keeping it renders an empty tab header/body beside the rail — the exact
        // Workstation failure when Commit Stream is the final item in its split child.
        expect(band).toBeTruthy();
        expect(band.dockNodeId).toBe('side-split');
        expect([...collectProjectedTabsById(band).keys()]).toEqual(['inspector-tabs']);
        expect(getProjectedSplitters(band), 'one surviving child has no split boundary').toHaveLength(0);
        expect(rail.railItems.map(item => item.dockItemId)).toEqual(['terminal'])
    });

    test('a split edge band with no live descendants projects rail-only', () => {
        let model  = createEdgeZoneModel(),
            before = JSON.stringify(model);

        model.items.terminal.autoHidden  = true;
        model.items.inspector.autoHidden = true;
        before = JSON.stringify(model);

        let result = DockLayoutAdapter.project(model, {
                resolveComponentRef: componentRef => ({ntype: 'dashboard-panel', reference: componentRef})
            }),
            row  = result.items[0],
            band = row.items.find(item => (item.cls || []).includes('neo-dashboard-dock-edge-band')),
            rail = row.items.find(item => item.dockNodeType === 'edge-rail');

        expect(band, 'an empty split wrapper must not retain the edge-band extent').toBeUndefined();
        expect(rail.railItems.map(item => item.dockItemId)).toEqual(['terminal', 'inspector']);
        expect(row.items.filter(item => item.dockNodeType === 'splitter'),
            'rail-only has no edge splitter against a missing band').toHaveLength(0);
        expect(JSON.stringify(model), 'projection never rewrites the committed split').toBe(before)
    });

    test('threads reducer callbacks from projection context into the rail affordance', () => {
        let applyDockZoneOperation    = () => null,
            model                     = createEdgeZoneModel(),
            onDockZoneDocumentChange  = () => null,
            resolveComponentRef       = componentRef => ({hidden: true, ntype: 'component', reference: componentRef}),
            resolveRevealComponentRef = componentRef => ({html: componentRef, ntype: 'component'});

        model.items.terminal.autoHidden = true;

        let result = DockLayoutAdapter.project(model, {
                applyDockZoneOperation,
                autoHideRevealOnHover: true,
                defaultRevealFraction: 0.4,
                onDockZoneDocumentChange,
                resolveComponentRef,
                resolveRevealComponentRef
            }),
            rail = result.items[0].items.find(item => item.dockNodeType === 'edge-rail');

        // Commits must ride the workspace's single operation path — same threading as splitters.
        expect(rail.applyDockZoneOperation).toBe(applyDockZoneOperation);
        expect(rail.onDockZoneDocumentChange).toBe(onDockZoneDocumentChange);
        expect(rail.dockZoneDocument).toBe(model);
        expect(rail.resolveComponentRef).toBe(resolveRevealComponentRef);
        expect(rail.resolveComponentRef('terminal')).toEqual({html: 'terminal', ntype: 'component'});
        // Workspace-level interaction options thread through; they default when absent.
        expect(rail.autoHideRevealOnHover).toBe(true);
        expect(rail.defaultRevealFraction).toBe(0.4);
        rail = DockLayoutAdapter.project(model, {resolveComponentRef})
            .items[0].items.find(item => item.dockNodeType === 'edge-rail');
        expect(rail.autoHideRevealOnHover).toBe(false);
        expect(rail.resolveComponentRef).toBe(resolveComponentRef)
    });

    test('resolveRevealExtent returns the committed edge extent, never a nested split share', () => {
        let model = createEdgeZoneModel();

        // Both items belong to the right edge. The nested split sizes are internal to that band;
        // reveal uses the edge descriptor's committed extent for either item.
        expect(DockLayoutAdapter.resolveRevealExtent(model, 'terminal')).toBeCloseTo(0.3);
        expect(DockLayoutAdapter.resolveRevealExtent(model, 'inspector')).toBeCloseTo(0.3);

        // strategy's tabs node sits directly in an edge-zone slot — no ancestor split, no extent.
        expect(DockLayoutAdapter.resolveRevealExtent(model, 'strategy')).toBeNull();

        // Unknown items and absent models fail null-safe.
        expect(DockLayoutAdapter.resolveRevealExtent(model, 'ghost')).toBeNull();
        expect(DockLayoutAdapter.resolveRevealExtent(null, 'terminal')).toBeNull();
    });

    test('projects one rail per edge with correct membership (multi-edge grouping)', () => {
        let model = createEdgeZoneModel();

        model.items.navigator    = {componentRef: 'navigator', title: 'Navigator', kind: 'panel'};
        model.nodes['left-tabs'] = {type: 'tabs', items: ['navigator'], activeItemId: 'navigator'};
        model.nodes.root.zones.left = {nodeId: 'left-tabs', extent: 0.2, resizable: true};

        model.items.navigator.autoHidden = true;
        model.items.terminal.autoHidden  = true;

        let result = DockLayoutAdapter.project(model, {
                resolveComponentRef: componentRef => ({ntype: 'dashboard-panel', reference: componentRef})
            }),
            rails = result.items[0].items.filter(item => item.dockNodeType === 'edge-rail');

        expect(rails.map(rail => rail.dockEdge)).toEqual(['left', 'right']);
        expect(rails[0].railItems.map(item => item.dockItemId)).toEqual(['navigator']);
        expect(rails[1].railItems.map(item => item.dockItemId)).toEqual(['terminal']);
    });

    test('re-projects consistently across rapid autoHidden toggles through the executor', () => {
        let model    = createEdgeZoneModel(),
            options  = {resolveComponentRef: componentRef => ({ntype: 'dashboard-panel', reference: componentRef})},
            findRail = result => result.items[0].items.find(item => item.dockNodeType === 'edge-rail');

        let hidden = Operations.applyOperation(model, {autoHidden: true, itemId: 'terminal', operation: 'setItemAutoHidden'});
        expect(hidden.errors).toEqual([]);

        let railed = findRail(DockLayoutAdapter.project(hidden.document, options));
        expect(railed.railItems.map(item => item.dockItemId)).toEqual(['terminal']);

        let restored = Operations.applyOperation(hidden.document, {autoHidden: false, itemId: 'terminal', operation: 'setItemAutoHidden'});
        expect(findRail(DockLayoutAdapter.project(restored.document, options))).toBeUndefined();

        let rehidden = Operations.applyOperation(restored.document, {autoHidden: true, itemId: 'terminal', operation: 'setItemAutoHidden'});
        expect(findRail(DockLayoutAdapter.project(rehidden.document, options)).railItems).toEqual(railed.railItems);
    });

    test('projects restorable: false for a railed item whose pinnable policy flipped off', () => {
        let model = createEdgeZoneModel();

        // Reachable state: the item railed first, then its policy flipped — the model would now
        // reject setItemAutoHidden(false), so the tab must not lie about the affordance.
        model.items.terminal.autoHidden = true;
        model.items.terminal.pinnable   = false;

        let result = DockLayoutAdapter.project(model, {
                resolveComponentRef: componentRef => ({ntype: 'dashboard-panel', reference: componentRef})
            }),
            rail = result.items[0].items.find(item => item.dockNodeType === 'edge-rail');

        expect(rail.railItems).toEqual([
            {dockEdge: 'right', dockItemId: 'terminal', restorable: false, title: 'Terminal'}
        ]);
    });

    test('projectTabsNode injects the tab-native overflow plugin into the projected header toolbar', () => {
        let result = DockLayoutAdapter.project(createModel(), {
                resolveComponentRef: componentRef => ({ntype: 'dashboard-panel', reference: componentRef})
            }),
            mainTabs = result.items[0],
            plugins  = mainTabs.headerToolbar?.plugins;

        // The dock CONSUMES the generic tab-overflow affordance by injecting Neo.tab.plugin.Overflow into
        // every projected tab header toolbar's plugins — a one-directional adapter→plugin consume (the plugin
        // owns its computeOverflow static, so nothing reaches back to the adapter). Wiring, not behavior: this
        // pins that the projection carries the plugin, so a silent drop of the injection is caught in CI.
        expect(mainTabs.ntype).toBe('tab-container');
        expect(mainTabs.ui, 'dock tab strips use the generic embedded-header variant').toBe('inline');
        expect(plugins).toHaveLength(1);
        expect(plugins[0].module).toBe(TabOverflowPlugin);
        expect(plugins[0].projectAsAction, 'dock headers project Overflow into their action rail').toBe(true);
    });

    test.describe('tab sort boundary + tear-out projection threading', () => {
        test('a workspace boundary enables ordinary cross-zone motion without arming tear-out', () => {
            const result = DockLayoutAdapter.project(createModel(), {
                dockWorkspaceBoundaryContainerId: 'dock-workspace-root',
                resolveComponentRef             : componentRef => ({ntype: 'dashboard-panel', reference: componentRef})
            });
            const config = result.items[0].headerToolbar.sortZoneConfig;

            expect(config).toMatchObject({
                allowOverdrag      : false,
                boundaryContainerId: 'dock-workspace-root',
                enableProxyToPopup : false
            })
        });

        test('an explicit tear-out boundary wins over the workspace default', () => {
            const result = DockLayoutAdapter.project(createModel(), {
                dockTearOutBoundaryContainerId  : 'tear-out-root',
                dockWorkspaceBoundaryContainerId: 'dock-workspace-root',
                resolveComponentRef             : componentRef => ({ntype: 'dashboard-panel', reference: componentRef})
            });

            expect(result.items[0].headerToolbar.sortZoneConfig.boundaryContainerId).toBe('tear-out-root')
        });

        test('enableDockTearOut arms the app-boundary popup grammar on every projected tab sort zone and threads the four gesture seams', () => {
            const captured = {cancel: [], entry: [], exit: [], terminal: []};

            const result = DockLayoutAdapter.project(createModel(), {
                dockTearOutBoundaryContainerId: 'workstation-root',
                enableDockTearOut             : true,
                onDockTearOutCancel           : data => captured.cancel.push(data),
                onDockTearOutEntry            : data => captured.entry.push(data),
                onDockTearOutExit             : data => captured.exit.push(data),
                onDockTearOutTerminal         : data => captured.terminal.push(data),
                resolveComponentRef           : componentRef => ({ntype: 'dashboard-panel', reference: componentRef})
            });

            const mainTabs = result.items[0];

            // The serializable flag rides the sortZoneConfig; the closures live on the tab.Container
            // listeners block — the projection's proven clone-safe closure home. A function inside
            // sortZoneConfig would not survive config cloning; this split is the load-bearing shape.
            expect(mainTabs.headerToolbar.sortZoneConfig).toMatchObject({
                boundaryContainerId: 'workstation-root',
                enableProxyToPopup : true
            });

            for (const [listener, bucket] of [
                ['dockTearOutCancel', 'cancel'], ['dockTearOutEntry', 'entry'],
                ['dockTearOutExit', 'exit'], ['dockTearOutTerminal', 'terminal']
            ]) {
                const handler = mainTabs.listeners[listener];

                expect(typeof handler, `${listener} must be wired`).toBe('function');
                handler({itemId: 'swarm'});
                expect(captured[bucket]).toEqual([{itemId: 'swarm'}])
            }
        });

        test('absent opt-in keeps the dock fully in-window: the flag projects false (the unchanged default)', () => {
            const result = DockLayoutAdapter.project(createModel(), {
                resolveComponentRef: componentRef => ({ntype: 'dashboard-panel', reference: componentRef})
            });

            const config = result.items[0].headerToolbar.sortZoneConfig;

            expect(config.enableProxyToPopup).toBe(false);
            expect(config).not.toHaveProperty('boundaryContainerId')
        })
    });

    test.describe('vessel-conversion projection threading — policy stays source-owned', () => {
        test('the explicit opt-in and finite calibration scalars reach every projected dock sort zone', () => {
            const liveRect = {height: 240, width: 320, x: 40, y: 60};
            const result   = DockLayoutAdapter.project(createModel(), {
                enableVesselConversion            : true,
                resolveComponentRef               : componentRef => ({ntype: 'dashboard-panel', reference: componentRef}),
                resolveVesselConversionSourceRect : () => liveRect,
                vesselConversionConvertThreshold  : 0.62,
                vesselConversionPointerExitGraceMs: 40,
                vesselConversionRevertThreshold   : 0.38
            });
            const config = result.items[0].headerToolbar.sortZoneConfig;

            expect(config).toMatchObject({
                enableVesselConversion            : true,
                vesselConversionConvertThreshold  : 0.62,
                vesselConversionPointerExitGraceMs: 40,
                vesselConversionRevertThreshold   : 0.38
            });
            expect(config).not.toHaveProperty('resolveVesselConversionSourceRect');

            const request = {sourceRect: null};

            result.items[0].listeners.dockVesselConversionSourceRectRequest(request);
            expect(request.sourceRect).toBe(liveRect)
        });

        test('strict lifecycle admissions and terminal settlements stay on clone-safe mutable records', async () => {
            const pending = Promise.resolve(true),
                  calls   = [],
                  result  = DockLayoutAdapter.project(createModel(), {
                      enableVesselConversion  : true,
                      onDockVesselConversionIn: data => {
                          calls.push(['in', data.itemId]);
                          return pending
                      },
                      onDockVesselConversionOut       : data => {
                          calls.push(['out', data.itemId]);
                          return true
                      },
                      onDockVesselConversionRetired   : data => {
                          calls.push(['retired', data.itemId]);
                          return true
                      },
                      onDockVesselConversionTerminal  : data => {
                          calls.push(['terminal', data.outcome]);
                          return pending
                      },
                      resolveComponentRef: componentRef => ({ntype: 'dashboard-panel', reference: componentRef})
                  }),
                  listeners = result.items[0].listeners,
                  convertIn = {admission: false, itemId: 'swarm'},
                  convertOut = {admission: false, itemId: 'swarm'},
                  terminal = {itemId: 'swarm', outcome: 'committed', settlement: false},
                  retired = {itemId: 'swarm', settlement: false};

            listeners.dockVesselConversionIn(convertIn);
            listeners.dockVesselConversionOut(convertOut);
            listeners.dockVesselConversionTerminal(terminal);
            listeners.dockVesselConversionRetired(retired);

            expect(convertIn.admission, 'Promise identity is preserved behind the source latch').toBe(pending);
            expect(convertOut.admission).toBe(true);
            expect(terminal.settlement).toBe(pending);
            expect(retired.settlement).toBe(true);
            expect(await terminal.settlement).toBe(true);
            expect(calls).toEqual([
                ['in', 'swarm'], ['out', 'swarm'], ['terminal', 'committed'], ['retired', 'swarm']
            ])
        });

        test('the default is fail-closed and does not mint placeholder calibration into the projection', () => {
            const result = DockLayoutAdapter.project(createModel(), {
                resolveComponentRef: componentRef => ({ntype: 'dashboard-panel', reference: componentRef})
            });
            const config = result.items[0].headerToolbar.sortZoneConfig;

            expect(config.enableVesselConversion).toBe(false);
            expect(config).not.toHaveProperty('vesselConversionConvertThreshold');
            expect(config).not.toHaveProperty('vesselConversionPointerExitGraceMs');
            expect(config).not.toHaveProperty('vesselConversionRevertThreshold');

            const request = {sourceRect: {height: 1, width: 1, x: 0, y: 0}};

            result.items[0].listeners.dockVesselConversionSourceRectRequest(request);
            expect(request.sourceRect).toBeNull();

            for (const eventName of [
                'dockVesselConversionIn',
                'dockVesselConversionOut',
                'dockVesselConversionTerminal',
                'dockVesselConversionRetired'
            ]) {
                const key = eventName === 'dockVesselConversionIn' || eventName === 'dockVesselConversionOut'
                        ? 'admission'
                        : 'settlement',
                    data = {[key]: true};

                result.items[0].listeners[eventName](data);
                expect(data[key]).toBe(false)
            }
        })
    });

    test.describe('whole-stack projection threading — one model-derived grip', () => {
        test('a live pane gets a reversible runtime header overlay with its original restored exactly', () => {
            const pane    = Neo.create(Component, {header: {text: 'Live pane'}}),
                item      = {componentRef: 'live', kind: 'panel', title: 'Live pane'},
                decorated = DockLayoutAdapter.decorateProjectedItem(pane, 'live', item, {stackHandle: true}),
                grip      = decorated.header.text[1];

            expect(decorated).toBe(pane);
            expect(grip.cls).toEqual(['neo-dock-stack-handle']);
            expect(grip.id).toBe('neo-dock-stack-handle-live');

            const restored = DockLayoutAdapter.decorateProjectedItem(pane, 'live', item);

            expect(restored).toBe(pane);
            expect(restored.header).toEqual({text: 'Live pane'});

            pane.destroy()
        });

        test('the opt-in decorates only the active resolved-stack header and threads its terminal', () => {
            const terminals = [];
            const model     = createEdgeZoneModel();
            const snapshot  = JSON.parse(JSON.stringify(model));
            const result    = DockLayoutAdapter.project(model, {
                enableStackDrag        : true,
                onDockStackDragTerminal: data => terminals.push(data),
                resolveComponentRef    : componentRef => ({ntype: 'dashboard-panel', reference: componentRef})
            });
            const mainTabs = result.items[0].items.find(item => item.dockNodeId === 'main-tabs');
            const side     = result.items[0].items.find(item => item.dockNodeId === 'side-split');
            const header   = mainTabs.items[1].header;

            expect(mainTabs.items[0].header.text).toBe('Strategy');
            expect(header.text[0]).toEqual({vtype: 'text', text: 'Swarm'});
            expect(header.text[1]).toMatchObject({
                'aria-hidden': true,
                cls          : ['neo-dock-stack-handle'],
                id           : 'neo-dock-stack-handle-swarm',
                tag          : 'span',
                title        : 'Drag whole stack'
            });
            expect(mainTabs.headerToolbar.sortZoneConfig.dockGroupNodeId).toBe('main-tabs');
            expect(side.items[0].headerToolbar.sortZoneConfig.dockGroupNodeId).toBeNull();

            mainTabs.listeners.dockStackDragTerminal({groupNodeId: 'main-tabs'});
            expect(terminals).toEqual([{groupNodeId: 'main-tabs'}]);
            expect(model).toEqual(snapshot)
        });

        test('without the opt-in every projected header and sort zone stays item-only', () => {
            const result = DockLayoutAdapter.project(createEdgeZoneModel(), {
                resolveComponentRef: componentRef => ({ntype: 'dashboard-panel', reference: componentRef})
            });
            const mainTabs = result.items[0].items[0];

            expect(mainTabs.items.map(item => item.header.text)).toEqual(['Strategy', 'Swarm']);
            expect(mainTabs.headerToolbar.sortZoneConfig.dockGroupNodeId).toBeNull()
        })
    });
});
