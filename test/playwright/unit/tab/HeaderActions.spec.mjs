import {setup} from '../../setup.mjs';

const appName = 'TabHeaderActionsTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import BaseContainer  from '../../../../src/container/Base.mjs';
import DialogToolbar  from '../../../../src/dialog/header/Toolbar.mjs';
import LivePreview    from '../../../../src/code/LivePreview.mjs';
import TabContainer   from '../../../../src/tab/Container.mjs';
import EffectButton   from '../../../../src/tab/header/EffectButton.mjs';
import Toolbar        from '../../../../src/toolbar/Base.mjs';
import '../../../../src/manager/Instance.mjs';

/**
 * @summary Pins flat toolbar action materialisation and mixed TabContainer semantics.
 */
test.describe.serial('Neo tab header actions', () => {
    let dragDropSnapshot = null,
        instances        = [];

    const own = instance => {
        instances.push(instance);
        return instance
    };

    test.afterEach(() => {
        instances.reverse().forEach(instance => !instance.isDestroyed && instance.destroy());
        instances = [];

        if (dragDropSnapshot) {
            if (dragDropSnapshot.existed) {
                Neo.main.addon.DragDrop = dragDropSnapshot.value
            } else {
                delete Neo.main.addon.DragDrop
            }

            dragDropSnapshot = null
        }
    });

    test('generic actions preserve ordinary items, fresh maps, and handler precedence', () => {
        let explicit = 0,
            generic  = 0,
            mapped   = 0,
            input    = {action: 'explicit', handler: () => explicit++},
            labelled = {
                handler: () => {},
                iconCls: 'fa fa-tag',
                vdom   : {'aria-labelledby': 'external-action-label'}
            },
            toolbar  = own(Neo.create(Toolbar, {
                actionMap: {
                    mapped: () => {
                        mapped++;
                        return {action: 'mapped', iconCls: 'fa fa-map'}
                    }
                },
                actions: [input, labelled],
                items  : [{module: Component, flag: 'ordinary'}]
            })),
            ordinary = toolbar.items[0],
            action   = toolbar.getActionItems()[0];

        toolbar.on('action', () => generic++);
        action.handler({component: action});

        expect(explicit).toBe(1);
        expect(generic, 'an explicit handler suppresses the generic event').toBe(0);
        expect(input.isToolbarAction, 'materialisation must not mutate the caller config').toBeUndefined();
        expect(toolbar.getActionItems()[1].vdom['aria-labelledby']).toBe('external-action-label');
        expect(toolbar.items.filter(item => item.isToolbarActionSpacer)).toHaveLength(1);

        toolbar.actions = ['mapped'];
        action = toolbar.getActionItems()[0];
        action.handler({component: action});

        expect(mapped, 'the action map resolves one fresh config for the replacement').toBe(1);
        expect(generic).toBe(1);
        expect(toolbar.items[0]).toBe(ordinary);
        expect(toolbar.items.map(item => item.isToolbarActionSpacer ? 'spacer' : item.action || item.flag))
            .toEqual(['ordinary', 'spacer', 'mapped']);

        function boundHandler() { return this.id }

        const firstHandler  = boundHandler.bind({id: 1}),
              secondHandler = boundHandler.bind({id: 2});

        toolbar.actions = [{action: 'bound', handler: firstHandler}];
        const firstBoundAction = toolbar.getActionItems()[0];
        toolbar.actions = [{action: 'bound', handler: secondHandler}];
        const secondBoundAction = toolbar.getActionItems()[0];

        expect(secondBoundAction).not.toBe(firstBoundAction);
        expect(secondBoundAction.handler()).toBe(2)
    });

    test('contextual inactivity reserves the instance while leaving consumer availability intact', () => {
        const toolbar = own(Neo.create(Toolbar, {
                  actions: [{action: 'contextual', contextual: true, iconCls: 'fa fa-eye'}]
              })),
              action  = toolbar.getActionItems()[0],
              handler = action.handler;

        expect(action.cls).toContain('neo-toolbar-action-context-inactive');
        expect(action.vdom.inert).toBe(true);
        expect(action.vdom['aria-hidden']).toBe('true');
        expect(action.vdom['aria-label']).toBe('contextual');
        expect(action.vdom.tabIndex).toBe(-1);

        toolbar.contextualActionsVisible = true;

        expect(toolbar.getActionItems()[0]).toBe(action);
        expect(action.handler).toBe(handler);
        expect(action.cls).not.toContain('neo-toolbar-action-context-inactive');
        expect(action.vdom.inert).toBeUndefined();
        expect(action.vdom['aria-hidden']).toBeUndefined();
        expect(action.vdom.tabIndex).toBeUndefined();

        action.vdom.tabIndex = 4;
        toolbar.contextualActionsVisible = false;
        toolbar.contextualActionsVisible = true;
        expect(action.vdom.tabIndex, 'each inactive cycle restores the latest consumer tabIndex').toBe(4);

        let geometryComponent;
        toolbar.on('actionGeometryChange', data => {
            geometryComponent = data.component
        });
        toolbar.onActionResize({component: action});
        expect(geometryComponent, 'action-root ResizeObserver changes have a toolbar signal').toBe(action);

        let removeDomAtVisibilitySignal;
        toolbar.on('actionVisibilityChange', () => {
            removeDomAtVisibilitySignal = action.vdom.removeDom
        });

        action.hidden = true;
        toolbar.contextualActionsVisible = false;
        toolbar.contextualActionsVisible = true;

        expect(action.hidden, 'focus context cannot overwrite consumer-owned availability').toBe(true);
        expect(removeDomAtVisibilitySignal, 'geometry invalidation follows the hidden DOM-state commit').toBe(true)
    });

    test('Dialog header order and headerAction payload stay compatible', () => {
        const toolbar = own(Neo.create(DialogToolbar, {title: 'Dialog'})),
              events  = [];

        toolbar.on('headerAction', data => events.push(data));

        expect(toolbar.items.map(item => item.isToolbarActionSpacer ? 'spacer' : item.action || item.flag))
            .toEqual(['title-label', 'spacer', 'maximize', 'close']);

        const close = toolbar.getActionItems().find(item => item.action === 'close');
        close.handler({component: close});

        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            action   : 'close',
            component: close,
            scope    : toolbar
        })
    });

    test('tab mutations use semantic buttons while preserving the flat action group', async () => {
        const tabs = own(Neo.create(TabContainer, {
                  activeIndex  : 1,
                  headerActions: [{
                      action    : 'custom',
                      contextual: false,
                      iconCls   : 'fa fa-star',
                      module    : EffectButton
                  }],
                  items        : [
                      {module: Component, header: {module: EffectButton, text: 'One'}},
                      {module: Component, header: {text: 'Two'}}
                  ]
              })),
              bar     = tabs.getTabBar(),
              action  = tabs.getActionItems()[0];

        expect(tabs.getCount()).toBe(2);
        expect(tabs.getTabButtons()[0]).toBeInstanceOf(EffectButton);
        expect(action).toBeInstanceOf(EffectButton);
        expect(tabs.getTabButtons()).not.toContain(action);
        expect(action.role, 'a tab-styled action keeps button semantics').toBe('button');
        expect(bar.items.map(item => item.isToolbarActionSpacer ? 'spacer' : item.action || item.text))
            .toEqual(['One', 'Two', 'spacer', 'custom']);

        tabs.insert(1, {module: Component, header: {text: 'Middle'}});
        tabs.add({module: Component, header: {text: 'Last'}});
        tabs.moveTo(3, 0);
        tabs.removeAt(2);
        await Promise.resolve();

        expect(tabs.getCount()).toBe(3);
        expect(tabs.getTabButtons().map(button => button.text)).toEqual(['Last', 'One', 'Two']);
        expect(tabs.getTabButtons().map(button => button.index)).toEqual([0, 1, 2]);
        expect(tabs.getActionItems()).toEqual([action]);
        expect(bar.items.slice(-2)).toEqual([bar.getActionSpacer(), action]);

        expect(() => {tabs.useActiveTabIndicator = false}).not.toThrow();
        expect(action.useActiveTabIndicator).toBe(true);

        function boundHandler() { return this.id }

        tabs.headerActions = [{action: 'bound', handler: boundHandler.bind({id: 1})}];
        const firstBoundAction = tabs.getActionItems()[0];
        tabs.headerActions = [{action: 'bound', handler: boundHandler.bind({id: 2})}];
        const secondBoundAction = tabs.getActionItems()[0];

        expect(secondBoundAction).not.toBe(firstBoundAction);
        expect(secondBoundAction.handler()).toBe(2)
    });

    test('tab SortZone admits only tab buttons, including after runtime action replacement', async () => {
        dragDropSnapshot = {
            existed: Object.hasOwn(Neo.main.addon, 'DragDrop'),
            value  : Neo.main.addon.DragDrop
        };
        Neo.ns('Neo.main.addon.DragDrop', true);
        Neo.main.addon.DragDrop = {
            setConfigs         : () => Promise.resolve({boundaryContainerRect: {bottom: 40, left: 0, right: 400, top: 0}}),
            setDragProxyElement: () => Promise.resolve()
        };

        const tabs = own(Neo.create(TabContainer, {
            appName,
            dragResortable: true,
            headerActions : [{action: 'first', iconCls: 'fa fa-one', module: EffectButton}],
            items         : [
                {module: Component, header: {text: 'One'}},
                {module: Component, header: {text: 'Two'}}
            ]
        }));

        await new Promise(resolve => setTimeout(resolve, 10));

        const bar      = tabs.getTabBar(),
              sortZone = bar.sortZone;

        expect(sortZone.dragHandleSelector).toBe('.neo-tab-header-button');
        expect(sortZone.getDraggableItems(bar.items)).toEqual(tabs.getTabButtons());
        expect(tabs.getTabButtons().every(item => item.wrapperCls.includes('neo-draggable'))).toBe(true);
        expect(bar.getActionItems().every(item => !item.wrapperCls.includes('neo-draggable'))).toBe(true);
        expect(bar.getActionSpacer().wrapperCls.includes('neo-draggable')).toBe(false);

        tabs.headerActions = [
            {action: 'second', iconCls: 'fa fa-two'},
            {action: 'third',  iconCls: 'fa fa-three'}
        ];
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(sortZone.getDraggableItems(bar.items)).toEqual(tabs.getTabButtons());
        expect(bar.getActionItems().every(item => !item.wrapperCls.includes('neo-draggable'))).toBe(true)
    });

    test('body focus arms contextual actions and the TabContainer realm retains them', () => {
        const tabs = own(Neo.create(TabContainer, {
                  headerActions: [{action: 'contextual', iconCls: 'fa fa-eye'}],
                  items        : [{module: Component, header: {text: 'One'}}]
              })),
              action = tabs.getActionItems()[0],
              body   = tabs.getCardContainer(),
              card   = tabs.getActiveCard(),
              bar    = tabs.getTabBar();

        expect(action.cls).toContain('neo-toolbar-action-context-inactive');

        tabs.onFocusEnter({path: [{id: card.id}, {id: body.id}, {id: tabs.id}]});
        expect(action.cls).not.toContain('neo-toolbar-action-context-inactive');

        tabs.onFocusMove({
            oldPath: [{id: card.id}, {id: body.id}, {id: tabs.id}],
            path   : [{id: action.id}, {id: bar.id}, {id: tabs.id}]
        });
        expect(action.cls).not.toContain('neo-toolbar-action-context-inactive');

        tabs.onFocusLeave({oldPath: [{id: action.id}, {id: bar.id}, {id: tabs.id}]});
        expect(action.cls).toContain('neo-toolbar-action-context-inactive')
    });

    test('LivePreview keeps semantic actions stable across active-tab and popup lifecycles', async () => {
        const
            addon            = Neo.main.addon,
            hadMonacoAddon   = Object.hasOwn(addon, 'MonacoEditor'),
            hadResizeAddon   = Object.hasOwn(addon, 'ResizeObserver'),
            oldGetByPath     = Neo.Main.getByPath,
            oldMonacoAddon   = addon.MonacoEditor,
            oldResizeAddon   = addon.ResizeObserver,
            oldSharedWorkers = Neo.config.useSharedWorkers,
            previousPopupApp = Neo.apps[42];

        let livePreview,
            popupMain;

        Neo.config.useSharedWorkers = true;
        addon.MonacoEditor = {destroyInstance() {}};
        addon.ResizeObserver = {unregister() {}};

        try {
            livePreview = Neo.create(LivePreview, {enableFullscreen: true});

            const tabs       = livePreview.tabContainer,
                  fullscreen = tabs.getActionItem('fullscreen'),
                  popout     = tabs.getActionItem('popout'),
                  handler    = fullscreen.handler;

            expect(tabs.getCount()).toBe(2);
            expect(tabs.getTabBar().items).toHaveLength(5);
            expect(tabs.getActionItems()).toEqual([fullscreen, popout]);
            expect(fullscreen.vdom['aria-label']).toBe('Toggle fullscreen preview');
            expect(popout.vdom['aria-label']).toBe('Open preview in a separate window');
            expect(popout.hidden).toBe(true);

            tabs.activeIndex = 1;
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(tabs.getActionItem('fullscreen')).toBe(fullscreen);
            expect(tabs.getActionItem('popout')).toBe(popout);
            expect(fullscreen.handler).toBe(handler);
            expect(popout.hidden).toBe(false);

            livePreview.createPopupWindow = async () => {};
            await popout.handler({component: popout});
            expect(popout.disabled).toBe(true);

            const previewContainer = livePreview.getReference('preview'),
                  previewView      = previewContainer.add({module: Component});

            popupMain = Neo.create(BaseContainer);
            Neo.apps[42] = {mainView: popupMain};
            Neo.Main.getByPath = async () => `http://localhost/preview?id=${livePreview.id}`;

            await livePreview.onWindowConnect({windowId: 42});

            expect(livePreview.connectedWindowId).toBe(42);
            expect(popupMain.items).toContain(previewView);
            expect(tabs.getTabAtIndex(1).disabled).toBe(true);
            expect(popout.disabled).toBe(true);

            await livePreview.onWindowDisconnect({windowId: 42});

            expect(livePreview.connectedWindowId).toBe(null);
            expect(previewContainer.items).toContain(previewView);
            expect(tabs.getTabAtIndex(1).disabled).toBe(false);
            expect(popout.disabled).toBe(false)
        } finally {
            livePreview?.destroy();
            popupMain && !popupMain.isDestroyed && popupMain.destroy();

            previousPopupApp === undefined ? delete Neo.apps[42] : Neo.apps[42] = previousPopupApp;
            Neo.Main.getByPath = oldGetByPath;
            Neo.config.useSharedWorkers = oldSharedWorkers;
            hadMonacoAddon ? addon.MonacoEditor = oldMonacoAddon : delete addon.MonacoEditor;
            hadResizeAddon ? addon.ResizeObserver = oldResizeAddon : delete addon.ResizeObserver
        }
    });
});
