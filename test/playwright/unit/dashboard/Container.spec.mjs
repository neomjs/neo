import {setup} from '../../setup.mjs';

const appName = 'DashboardContainerAdmissionTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Container      from '../../../../src/dashboard/Container.mjs';
import BaseContainer  from '../../../../src/container/Base.mjs';
import Component      from '../../../../src/component/Base.mjs';
import '../../../../src/manager/Instance.mjs';

/**
 * @summary Installs the real main-thread popup call grammar around a configurable Boolean result.
 * The production owner consumes `windowOpen` as an admission decision, so these seams keep the
 * Boolean result visible instead of replacing it with a successful-looking window descriptor.
 * @param {Object} [config={}]
 * @param {Error|null} [config.openError=null]
 * @param {Boolean} [config.openResult=true]
 * @returns {Object} call state plus `restore()`.
 */
function installWindowVessel({openError = null, openResult = true} = {}) {
    let previous = {
            getWindowData: Neo.Main.getWindowData,
            windowOpen   : Neo.Main.windowOpen
        },
        previousWindowConfigs = Neo.windowConfigs,
        state                 = {openCalls: []};

    Neo.windowConfigs = {'unit-window': {basePath: './'}};

    Neo.Main.getWindowData = async () => ({
        innerHeight: 900,
        outerHeight: 960,
        screenLeft : 10,
        screenTop  : 20
    });
    Neo.Main.windowOpen = async data => {
        state.openCalls.push(data);
        if (openError) throw openError;
        return openResult
    };

    return {
        get openCalls() { return state.openCalls },
        restore() {
            Object.assign(Neo.Main, previous);
            Neo.windowConfigs = previousWindowConfigs
        }
    }
}

/**
 * @summary The generic dashboard popup boundary consumes strict vessel admission without inventing
 * detached ownership. The suite drives the real `Container` instance because both boundary callers
 * close over private drag-state latches that a prototype-only fake cannot witness.
 */
test.describe('Neo.dashboard.Container — popup admission', () => {
    let container, vessel;

    const rect   = () => ({height: 530, width: 640, x: 40, y: 50}),
          widget = () => ({id: 'graph', reference: 'graph', wrapperStyle: {}});

    test.beforeEach(() => {
        container = Neo.create(Container, {
            appName,
            detachToNewWindow: true,
            dragResortable   : false,
            id               : 'dashboard-admission-test',
            items            : [],
            popupUrl         : 'popup.html'
        })
    });

    test.afterEach(() => {
        vessel?.restore();
        vessel = null;
        container?.destroy();
        container = null
    });

    test('Boolean false rolls back a newly staged detached item and returns no popup geometry', async () => {
        vessel = installWindowVessel({openResult: false});

        const popupData = await container.openWidgetInPopup(widget(), rect());

        expect(popupData).toBeNull();
        expect(container.detachedItems.has('graph')).toBe(false);
        expect(vessel.openCalls).toHaveLength(1)
    });

    test('Boolean true keeps provisional-before-await ordering and returns the admitted vessel geometry', async () => {
        let sawProvisional = false,
            item           = widget();

        vessel = installWindowVessel();
        Neo.Main.windowOpen = async () => {
            sawProvisional = container.detachedItems.get('graph')?.widget === item;
            return true
        };

        const popupData = await container.openWidgetInPopup(item, rect());

        expect(sawProvisional, 'the popup can connect before the App-Worker response returns').toBe(true);
        expect(popupData).toEqual({
            popupHeight: 480,
            popupLeft  : 50,
            popupTop   : 130,
            popupWidth : 640,
            windowName : 'graph'
        });
        expect(container.detachedItems.get('graph')?.widget).toBe(item)
    });

    test('failed replacement restores the exact prior detached entry instead of deleting it', async () => {
        const previous = {index: 3, widget: {id: 'old-graph'}, windowId: 'existing-vessel'};

        vessel = installWindowVessel({openResult: false});
        container.detachedItems.set('graph', previous);

        await container.openWidgetInPopup(widget(), rect());

        expect(container.detachedItems.get('graph')).toBe(previous)
    });

    test('a throwing admission seam follows the same rollback path as Boolean false', async () => {
        const realConsoleError = console.error;

        vessel = installWindowVessel({openError: new Error('transport failed after request')});
        console.error = () => {};

        try {
            await expect(container.openWidgetInPopup(widget(), rect())).resolves.toBeNull();
            expect(container.detachedItems.has('graph')).toBe(false)
        } finally {
            console.error = realConsoleError
        }
    });

    test('failed initial boundary admission restores the armed sort-zone and container drag state', async () => {
        const
            inserted = [],
            started  = [],
            item     = widget(),
            sortZone = {
                isWindowDragging: true,
                reattachArmed   : true,
                startWindowDrag : data => started.push(data)
            };

        container.openWidgetInPopup = async () => null;

        await container.onDragBoundaryExit({draggedItem: item, proxyRect: rect(), sortZone});

        expect(started).toHaveLength(0);
        expect(sortZone.isWindowDragging).toBe(false);
        expect(sortZone.reattachArmed).toBe(false);

        // `onWindowDisconnect` skips reintegration while the container-private latch is true. Its
        // successful reinsertion here proves the failed boundary restored that second owner too.
        container.detachedItems.set('graph', {index: 0, widget: item, windowId: 'stale-vessel'});
        container.insert = (index, entry) => inserted.push({entry, index});
        await container.onWindowDisconnect({windowId: 'stale-vessel'});

        expect(inserted).toEqual([{entry: item, index: 0}])
    });

    test('failed legacy resume never dereferences geometry or re-arms main-thread pointer-follow', async () => {
        const
            calls         = [],
            previousAddon = Neo.main?.addon?.DragDrop,
            item          = widget();

        Neo.ns('Neo.main.addon.DragDrop', true);
        Neo.main.addon.DragDrop = {startWindowDrag: data => calls.push(data)};
        container.detachedItems.set('graph', {index: 0, widget: item, windowId: 'parked-vessel'});
        container.openWidgetInPopup = async () => null;

        try {
            await expect(container.resumeWindowDrag('graph', rect())).resolves.toBeUndefined();
            expect(calls).toHaveLength(0)
        } finally {
            Neo.main.addon.DragDrop = previousAddon
        }
    })
});

/**
 * @summary A physical popup close restores the original widget once, whether the held drag retained
 * its source slot or an ordinary popup move removed it. Real container mutations preserve the
 * ownership and VDOM-reference boundaries that a stubbed insert cannot exercise.
 */
test.describe('Neo.dashboard.Container — popup return ownership', () => {
    for (const {held, replaceAdmission} of [{held: true}, {held: false}, {held: true, replaceAdmission: true}]) {
        test(`${held ? 'held tear-out' : 'ordinary popup'} ${replaceAdmission ? 'preserves a newer admission' : 'returns once across repeated disconnects'}`, async () => {
            const
                dashboard = Neo.create(Container, {
                    appName,
                    dragResortable: false,
                    popupUrl      : 'popup.html',
                    windowId      : 1,
                    items         : [{module: Component}, {module: Component, reference: 'return-widget'}, {module: Component}]
                }),
                popupWindowId = `dashboard-return-${held}`,
                popup = Neo.create(BaseContainer, {appName, items: [], windowId: popupWindowId}),
                originalItems = [...dashboard.items],
                widget = originalItems[1],
                popupApp = {...Neo.apps[1], mainView: popup, windowId: popupWindowId},
                previousGetByPath = Neo.Main.getByPath,
                vessel = installWindowVessel(),
                starts = [],
                refs = owner => owner.getVdomItemsRoot().cn.map(node => node.componentId);

            Neo.apps[popupWindowId] = popupApp;
            Neo.appsByName[appName].push(popupApp);
            Neo.Main.getByPath = async () => `https://fixture.invalid/popup.html?dashboardId=${dashboard.id}&name=return-widget`;

            try {
                const proxyRect = {height: 530, width: 640, x: 40, y: 50};

                if (held) {
                    await dashboard.onDragBoundaryExit({
                        draggedItem: widget,
                        proxyRect,
                        sortZone   : {startWindowDrag: data => starts.push(data)}
                    });
                    expect(starts).toHaveLength(1)
                } else {
                    await dashboard.openWidgetInPopup(widget, proxyRect)
                }

                await dashboard.onWindowConnect({appName, windowId: popupWindowId});

                expect(widget.parent).toBe(popup);
                expect(widget.windowId).toBe(popupWindowId);
                expect(dashboard.items.filter(item => item === widget)).toHaveLength(held ? 1 : 0);
                expect(refs(dashboard).filter(id => id === widget.id)).toHaveLength(held ? 1 : 0);

                if (held) {
                    dashboard.onWindowDragTerminalDrop({draggedItem: widget, sortZone: null});
                    dashboard.onDragEnd({})
                }

                let   popupUpdates = 0;
                const updatePopup  = popup.update;
                popup.update = (...args) => {
                    popupUpdates++;
                    return updatePopup.apply(popup, args)
                };

                const removed         = Promise.withResolvers(),
                      updateDashboard = dashboard.promiseUpdate;
                let removalUpdates = 0;

                dashboard.mounted = true;
                dashboard.promiseUpdate = (...args) => {
                    if (!dashboard.items.includes(widget)) {
                        removalUpdates++;
                        return removed.promise
                    }
                    return updateDashboard.apply(dashboard, args)
                };

                const returning = dashboard.onWindowDisconnect({appName, windowId: popupWindowId});
                let replacement;

                if (held) {
                    try {
                        expect(removalUpdates, 'the retained reservation is rendered away before reinsertion').toBe(1);
                        expect(dashboard.items).not.toContain(widget);
                        await dashboard.onWindowDisconnect({appName, windowId: popupWindowId});
                        expect(dashboard.items, 'a duplicate event cannot insert across the pending removal').not.toContain(widget);

                        if (replaceAdmission) {
                            await dashboard.openWidgetInPopup(widget, {height: 530, width: 640, x: 40, y: 50});
                            replacement = dashboard.detachedItems.get('return-widget')
                        }
                    } finally {
                        removed.resolve();
                        await returning
                    }
                }

                await returning;

                expect(popupUpdates, 'the closed render target receives no new update').toBe(0);

                if (replaceAdmission) {
                    expect(dashboard.detachedItems.get('return-widget')).toBe(replacement);
                    expect(dashboard.items, 'the old return cannot reclaim the newly admitted widget').not.toContain(widget);
                    return
                }

                expect(dashboard.items, 'the same instances return to their original order').toEqual(originalItems);
                expect(refs(dashboard)).toEqual(originalItems.map(item => item.id));
                expect(widget.parent).toBe(dashboard);
                expect(widget.windowId).toBe(dashboard.windowId);
                expect(widget.isDestroyed).not.toBe(true);
                expect(popup.items).toEqual([]);
                expect(dashboard.detachedItems.size).toBe(0);

                await dashboard.onWindowDisconnect({appName, windowId: popupWindowId});
                expect(dashboard.items).toEqual(originalItems);
                expect(refs(dashboard)).toEqual(originalItems.map(item => item.id))
            } finally {
                const instances = new Set([...originalItems, ...dashboard.items, ...popup.items]);

                dashboard.removeAll(false, true);
                popup.removeAll(false, true);
                instances.forEach(item => !item.isDestroyed && item.destroy(true, true));
                dashboard.destroy();
                popup.destroy();
                delete Neo.apps[popupWindowId];
                Neo.appsByName[appName] = Neo.appsByName[appName].filter(app => app !== popupApp);
                Neo.Main.getByPath = previousGetByPath;
                vessel.restore()
            }
        })
    }
});
