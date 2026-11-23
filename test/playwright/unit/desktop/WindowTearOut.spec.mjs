import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'WindowTearOutTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import Component     from '../../../../src/component/Base.mjs';
import Provider      from '../../../../src/state/Provider.mjs';
import AppWindow     from '../../../../src/desktop/AppWindow.mjs';
import Apps          from '../../../../src/desktop/store/Apps.mjs';
import PopupViewport from '../../../../src/desktop/PopupViewport.mjs';
import Tasks         from '../../../../src/desktop/store/Tasks.mjs';
import WindowManager from '../../../../src/desktop/WindowManager.mjs';

const
    rect        = {left: 400, top: 100, width: 460, height: 360},
    childClose  = {nativeHandleKey: 'native-handle', targetWindowId: 'child', windowId: 'source'},
    handleProbe = {nativeHandleKey: 'native-handle', windowId: 'source'};

test.describe('Desktop window tear-out admission and restoration', () => {
    let apps, host, manager, nativeClosed, nativeCloseAllowed, opened, original, owner,
        physicallyClosed, popups, probed, focused, lost, refusals, released, semanticClosed, tasks;

    test.beforeEach(async () => {
        original       = {apps: Neo.apps, currentWorker: Neo.currentWorker, Main: Neo.Main, toast: Neo.toast, windowConfigs: Neo.windowConfigs};
        focused        = [];
        lost           = [];
        nativeClosed   = [];
        opened         = [];
        popups         = new Map();
        probed         = [];
        refusals       = [];
        released       = [];
        semanticClosed = [];
        nativeCloseAllowed = true;
        physicallyClosed   = false;

        Neo.apps          = {...Neo.apps, source: {...Neo.apps[1]}};
        Neo.currentWorker = {...Neo.currentWorker, isSharedWorker: true};
        Neo.toast         = config => refusals.push(config);
        Neo.windowConfigs = {source: {url: {href: 'https://example.test/desktop/index.html?theme=light'}}};
        Neo.Main = {...Neo.Main,
            windowClose              : async data => {semanticClosed.push(data); return true},
            windowNativeClose        : async data => {nativeClosed.push(data); return nativeCloseAllowed},
            windowNativeFocus        : async data => {focused.push(data); return true},
            windowNativeIsClosed     : async data => {probed.push(data); return physicallyClosed},
            windowNativeReleaseClosed: async data => {released.push(data); return physicallyClosed},
            windowOpen               : async data => {opened.push(data); return true}
        };

        apps    = Neo.create(Apps, {data: [{id: 'notes', text: 'Notes'}]});
        tasks   = Neo.create(Tasks);
        manager = Neo.create(WindowManager, {
            appStore    : apps,
            taskStore   : tasks,
            windowClass : AppWindow,
            windowConfig: record => ({
                appName      : Neo.apps.source.name,
                draggable    : false,
                items        : [{module: Component, text: 'edited note'}],
                record,
                resizable    : false,
                stateProvider: {module: Provider, data: {record: null}},
                tearOutUrl   : './index.html',
                windowId     : 'source',
                syncModalMask() {},
                onTearOutDisconnect(data) {
                    lost.push(data);
                    AppWindow.prototype.onTearOutDisconnect.call(this, data)
                }
            })
        });

        owner = await manager.openApp(apps.get('notes'));
        host  = owner.tearOut
    });

    test.afterEach(async () => {
        nativeCloseAllowed = true;
        await host?.returnToDesktop();
        manager?.destroy();
        popups.forEach(view => view.destroy());
        apps.destroy();
        tasks.destroy();
        Object.assign(Neo, original)
    });

    /**
     * @summary Delivers a child boot with its URL and opener-issued route.
     * @param {String} popupName
     * @param {String} [windowId='child']
     * @param {Object} [routeOverrides={}]
     * @returns {Neo.container.Base} The child viewport's body slot.
     */
    const connect = (popupName, windowId='child', routeOverrides={}) => {
        let view = popups.get(windowId);

        if (!view) {
            view = Neo.create(PopupViewport, {applyBodyCls: false, autoMount: false, windowId});
            popups.set(windowId, view);
            Neo.apps[windowId] = {...Neo.apps.source, mainView: view}
        }

        Neo.windowConfigs[windowId] = {url: {search: `?desktopPopup=${popupName}`}};
        host.onWindowConnect({windowId, windowData: {
            nativeRoute: {
                capabilities   : {close: true, focus: true},
                nativeHandleKey: 'native-handle',
                ownerWindowId  : 'source',
                targetWindowId : windowId,
                windowName     : popupName,
                ...routeOverrides
            },
            outerHeight: 345,
            outerWidth : 480
        }});
        return view.getReference('desktopPopupBody')
    };

    test('the same live app, including state-provider ancestry, comes home exactly once', async () => {
        const body        = owner.getItem('bodyContainer'),
              note        = body.items[0],
              {popupName} = await host.open({rect});

        expect(new URL(opened[0].url).searchParams.get('theme')).toBe('light');
        expect(opened[0].renewNativeRouteOnReload).toBe(true);
        expect(host.currentSize).toBeNull();

        const target = connect(popupName);
        expect(host.currentSize).toEqual({width: 480, height: 345});
        expect(target.items[0]).toBe(body);
        expect(owner.stateProvider).toBeInstanceOf(Provider);
        expect(note.getStateProvider()).toBe(owner.stateProvider);
        note.text = 'written while detached';

        const retirement = host.returnToDesktop();
        expect(host.returnToDesktop()).toBe(retirement);
        expect(await retirement).toBe(true);
        host.onWindowDisconnect({windowId: 'child'});
        expect(owner.getItem('bodyContainer')).toBe(body);
        expect(body.items[0]).toBe(note);
        expect(note.text).toBe('written while detached');
        expect(note.windowId).toBe('source');
        expect(nativeClosed).toEqual([childClose]);
        expect(semanticClosed).toEqual([]);
        expect(lost).toEqual([])
    });

    test('release before child boot keeps the app in the child until it closes', async () => {
        const body = owner.getItem('bodyContainer'), {popupName} = await host.open({gestureId: 1, rect});
        expect(host.commit()).toBe(true);
        const target = connect(popupName);
        expect(target.items[0]).toBe(body);
        physicallyClosed = true;
        host.onWindowDisconnect({windowId: 'child'});
        await expect.poll(() => lost).toEqual([{committed: true}]);
        expect(owner.getItem('bodyContainer')).toBe(body);
        expect(tasks.getCount()).toBe(0);
        expect(probed).toEqual([handleProbe]);
        expect(released).toEqual([{...handleProbe, windowName: popupName}]);
        expect(host.committed).toBe(false)
    });

    test('external close during explicit return releases the exact handle and keeps the returned task', async () => {
        const body = owner.getItem('bodyContainer'), {popupName} = await host.open({rect});
        connect(popupName);
        nativeCloseAllowed = false;
        physicallyClosed   = true;

        const retirement = host.returnToDesktop();
        host.onWindowDisconnect({windowId: 'child'});

        expect(await retirement).toBe(true);
        expect(owner.getItem('bodyContainer')).toBe(body);
        expect(tasks.getCount()).toBe(1);
        expect(released).toEqual([{...handleProbe, windowName: popupName}]);
        expect(lost).toEqual([])
    });

    test('a grant after cancellation cannot reclaim the body or close its successor', async () => {
        let release;
        Neo.Main.windowOpen = async data => {
            opened.push(data);
            return opened.length === 1 ? await new Promise(resolve => release = resolve) : true
        };
        const body         = owner.getItem('bodyContainer'),
              stale        = host.open({rect}),
              retirement   = host.returnToDesktop(),
              {windowName} = opened[0];
        release(true);

        expect(await stale).toBeNull();
        expect(await retirement).toBe(true);
        expect(semanticClosed).toEqual([{names: [windowName], windowId: 'source'}]);

        const current     = await host.open({rect}),
              staleTarget = connect(windowName);
        expect(staleTarget.items).toHaveLength(0);
        expect(connect(current.popupName, 'successor').items).toEqual([body]);
        expect(nativeClosed).toEqual([])
    });

    test('a child connecting before admission cannot take a body the browser has yet to grant', async () => {
        let release;
        Neo.Main.windowOpen = data => {
            opened.push(data);
            return new Promise(resolve => release = resolve)
        };
        const opening = host.open({gestureId: 1, rect}),
              body    = owner.getItem('bodyContainer'),
              target  = connect(opened[0].windowName);
        expect(target.items).toHaveLength(0);
        expect(host.commit()).toBe(false);
        release(true);
        await opening;
        expect(target.items[0]).toBe(body);
        host.onWindowDisconnect({windowId: 'child'});
        await host.returnToDesktop();
        expect(lost).toEqual([{committed: false}]);
        expect(owner.getItem('bodyContainer')).toBe(body)
    });

    test('a refused popup reports once and leaves the original live body reachable', async () => {
        Neo.Main.windowOpen = async () => false;
        const body = owner.getItem('bodyContainer');
        expect(await host.open({rect})).toBeNull();
        expect(refusals).toEqual([expect.objectContaining({
            appName: 'WindowTearOutTest', msg: expect.stringMatching(/allow pop-ups/i), role: 'status', windowId: 'source'
        })]);
        expect(host.commit()).toBe(false);
        expect(owner.getItem('bodyContainer')).toBe(body);
        expect(nativeClosed).toEqual([]);
        expect(semanticClosed).toEqual([])
    });

    test('invalid geometry, transport failure and an indeterminate response never report a browser refusal', async () => {
        Neo.Main.windowOpen = async data => {
            opened.push(data);
            throw new Error('opener disconnected')
        };
        expect(await host.open({rect: {...rect, width: 0}})).toBeNull();
        expect(opened).toHaveLength(0);
        expect(await host.open({rect})).toBeNull();
        expect(opened).toHaveLength(1);
        Neo.Main.windowOpen = async () => undefined;
        expect(await host.open({rect})).toBeNull();
        expect(refusals).toEqual([]);
        expect(tasks.getCount()).toBe(1)
    });

    for (const [action, end] of Object.entries({
        hide : () => owner.hide(false),
        close: () => manager.close('notes')
    })) {
        test(`a late browser refusal stays silent after ${action}`, async () => {
            const admission = Promise.withResolvers();
            Neo.Main.windowOpen = () => admission.promise;
            const opening = host.open({gestureId: 1, rect});

            end();
            admission.resolve(false);
            expect(await opening).toBeNull();
            expect(refusals).toEqual([])
        })
    }

    test('a canceled admission cannot report its refusal on the successor gesture', async () => {
        const admission = Promise.withResolvers(), body = owner.getItem('bodyContainer');
        Neo.Main.windowOpen = async data => {
            opened.push(data);
            return opened.length === 1 ? admission.promise : true
        };
        const first      = host.open({gestureId: 1, rect}),
              retirement = host.returnToDesktop(),
              second     = host.open({gestureId: 2, rect});

        admission.resolve(false);
        expect(await first).toBeNull();
        await retirement;
        const {popupName} = await second;
        expect(connect(popupName).items).toEqual([body]);
        expect(opened).toHaveLength(2);
        expect(refusals).toEqual([])
    });

    test('a refused native close restores the source and retries the same exact route', async () => {
        const body        = owner.getItem('bodyContainer'),
              {popupName} = await host.open({rect}),
              target      = connect(popupName);

        expect(target.items).toEqual([body]);
        nativeCloseAllowed = false;
        expect(await host.returnToDesktop()).toBe(false);
        expect(target.items).toEqual([]);
        expect(owner.getItem('bodyContainer')).toBe(body);
        expect(probed).toEqual([handleProbe]);

        nativeCloseAllowed = true;
        expect(await host.returnToDesktop()).toBe(true);
        expect(nativeClosed).toEqual([childClose, childClose]);
        expect(semanticClosed).toEqual([]);
        expect(lost).toEqual([])
    });

    for (const disconnectFirst of [true, false]) {
        test(`reload keeps the live body and task when ${disconnectFirst ? 'disconnect' : 'connect'} lands first`, async () => {
            const body         = owner.getItem('bodyContainer'),
                  note         = body.items[0],
                  task         = tasks.get('notes'),
                  sourceParent = body.parent,
                  {popupName}  = await host.open({rect}),
                  target       = connect(popupName),
                  placeholder  = sourceParent.items.find(item => item.dockItemId === owner.id);

            expect(host.committed).toBe(true);
            expect(target.items).toEqual([body]);
            expect(placeholder).toBeTruthy();
            note.text = 'written before reload';

            if (disconnectFirst) {
                host.onWindowDisconnect({windowId: 'child'});
                expect(body.parent).toBeNull();
                expect(probed).toEqual([handleProbe])
            }

            const unrelated = connect(popupName, 'unrelated', {nativeHandleKey: 'different-handle'}),
                  reloaded  = connect(popupName, 'reloaded');
            if (!disconnectFirst) host.onWindowDisconnect({windowId: 'child'});

            await expect.poll(() => popups.get('reloaded').getReference('desktopPopupToolbar').hidden).toBe(false);
            expect(unrelated.items).toEqual([]);
            expect(target.items).toEqual([]);
            expect(reloaded.items).toEqual([body]);
            expect(body.items[0]).toBe(note);
            expect(note.text).toBe('written before reload');
            expect(note.windowId).toBe('reloaded');
            expect(note.getStateProvider()).toBe(owner.stateProvider);
            expect(sourceParent.items).toContain(placeholder);
            expect(tasks.get('notes')).toBe(task);
            expect(tasks.getCount()).toBe(1);
            expect(lost).toEqual([]);
            expect(released).toEqual([]);

            manager.restore('notes');
            expect(focused).toEqual([expect.objectContaining({...childClose, targetWindowId: 'reloaded'})]);
            expect(await host.returnToDesktop()).toBe(true);
            expect(nativeClosed).toEqual([{...childClose, targetWindowId: 'reloaded'}]);
            expect(owner.getItem('bodyContainer')).toBe(body);
            expect(tasks.get('notes')).toBe(task)
        })
    }
});
