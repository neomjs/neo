import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'WindowTearOutTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import Container     from '../../../../src/container/Base.mjs';
import Component     from '../../../../src/component/Base.mjs';
import Provider      from '../../../../src/state/Provider.mjs';
import AppWindow     from '../../../../src/desktop/AppWindow.mjs';
import WindowTearOut from '../../../../src/desktop/WindowTearOut.mjs';

const rect = {left: 400, top: 100, width: 460, height: 360};

test.describe('Desktop window tear-out admission and restoration', () => {
    let original, owner, target, host, closed, opened, lost;

    test.beforeEach(() => {
        original = {apps: Neo.apps, currentWorker: Neo.currentWorker, Main: Neo.Main, windowConfigs: Neo.windowConfigs};
        closed = [];
        lost   = [];
        opened = [];
        Neo.currentWorker = {...Neo.currentWorker, isSharedWorker: true};
        Neo.windowConfigs = {source: {url: {href: 'https://example.test/desktop/index.html?theme=light'}}};
        Neo.Main = {...Neo.Main,
            windowOpen : async data => {opened.push(data); return true},
            windowClose: async ({names}) => {closed.push(names); return true}
        };
        owner = Neo.create(AppWindow, {
            autoShow           : false, draggable: false, resizable: false, windowId: 'source',
            stateProvider      : {module: Provider, data: {record: null}},
            items              : [{module: Component, text: 'edited note'}],
            onTearOutDisconnect: data => lost.push(data)
        });
        target = Neo.create(Container, {windowId: 'child'});
        host   = Neo.create(WindowTearOut, {owner, popupUrl: './index.html'});
        Neo.apps = {...Neo.apps, child: {mainView: target}}
    });

    test.afterEach(() => {
        host.destroy();
        target.destroy();
        owner.destroy();
        Object.assign(Neo, original)
    });

    const connect = popupName => {
        Neo.windowConfigs.child = {url: {search: '?desktopPopup=' + popupName}};
        host.onWindowConnect({windowId: 'child', windowData: {outerWidth: 480, outerHeight: 345, nativeRoute: {
            nativeHandleKey: 'native-handle', ownerWindowId: 'source', targetWindowId: 'child'
        }}})
    };

    test('the same live app, including state-provider ancestry, comes home exactly once', async () => {
        const body        = owner.getItem('bodyContainer'), note = body.items[0],
              {popupName} = await host.open({rect});
        expect(new URL(opened[0].url).searchParams.get('theme')).toBe('light');
        expect(host.currentSize).toBeNull();
        connect(popupName);
        expect(host.currentSize).toEqual({width: 480, height: 345});
        expect(target.items[0]).toBe(body);
        expect(owner.stateProvider).toBeInstanceOf(Provider);
        expect(note.getStateProvider()).toBe(owner.stateProvider);
        note.text = 'written while detached';

        host.returnToDesktop();
        host.returnToDesktop();
        host.onWindowDisconnect({windowId: 'child'});
        expect(owner.getItem('bodyContainer')).toBe(body);
        expect(body.items[0]).toBe(note);
        expect(note.text).toBe('written while detached');
        expect(note.windowId).toBe('source');
        expect(closed).toEqual([popupName]);
        expect(lost).toEqual([])
    });

    test('release before child boot keeps the app in the child until it closes', async () => {
        const body = owner.getItem('bodyContainer'), {popupName} = await host.open({rect});
        expect(host.commit()).toBe(true);
        connect(popupName);
        expect(target.items[0]).toBe(body);
        host.onWindowDisconnect({windowId: 'child'});
        expect(owner.getItem('bodyContainer')).toBe(body);
        expect(lost).toEqual([{committed: true}]);
        expect(host.committed).toBe(false)
    });

    test('a grant after cancellation cannot reclaim the body or close its successor', async () => {
        let release;
        Neo.Main.windowOpen = async data => {
            opened.push(data);
            return opened.length === 1 ? await new Promise(resolve => release = resolve) : true
        };
        const stale = host.open({rect}), {windowName} = opened[0];
        host.returnToDesktop();
        const current = await host.open({rect});
        connect(windowName);
        release(true);

        expect(await stale).toBeNull();
        expect(closed).toEqual([windowName]);
        expect(target.items).toHaveLength(0);
        connect(current.popupName);
        expect(target.items).toHaveLength(1)
    });

    test('a child connecting before admission cannot take a body the browser has yet to grant', async () => {
        let release;
        Neo.Main.windowOpen = data => {
            opened.push(data);
            return new Promise(resolve => release = resolve)
        };
        const opening = host.open({rect}), body = owner.getItem('bodyContainer');
        connect(opened[0].windowName);
        expect(target.items).toHaveLength(0);
        expect(host.commit()).toBe(false);
        release(true);
        await opening;
        expect(target.items[0]).toBe(body);
        host.onWindowDisconnect({windowId: 'child'});
        expect(lost).toEqual([{committed: false}]);
        expect(owner.getItem('bodyContainer')).toBe(body)
    });

    test('refusal leaves the original live body reachable', async () => {
        Neo.Main.windowOpen = async () => false;
        const body = owner.getItem('bodyContainer');
        expect(await host.open({rect})).toBeNull();
        expect(host.commit()).toBe(false);
        expect(owner.getItem('bodyContainer')).toBe(body);
        expect(closed).toEqual([])
    })
});
