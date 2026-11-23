import {setup} from '../../setup.mjs';

setup();

import {expect, test} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import WindowDragZone from '../../../../src/desktop/WindowDragZone.mjs';

/** @summary Drives the desktop boundary with actual App-side move and terminal handlers and an asynchronous native host. */
test.describe('desktop window tear-out gesture', () => {
    let host, zone, admit, addon, events, visibility;

    const frame = x => ({clientX: x + 100, clientY: 40, screenX: x + 180, screenY: 140}),
          grant = {popupName: 'child', popupWidth: 960, popupHeight: 560};

    test.beforeEach(() => {
        events = [];
        visibility = [];
        host = {
            open           : () => new Promise(resolve => {admit = resolve; events.push('open')}),
            commit         : () => events.push('commit'),
            returnToDesktop: async () => {events.push('restore'); return true}
        };
        addon = Neo.main.addon.DragDrop;
        Neo.main.addon.DragDrop = {
            setConfigs     : () => {},
            startWindowDrag: async () => {events.push('follow'); return true}
        };
        zone = Neo.create(WindowDragZone, {
            boundaryContainerRect: {left: 0, top: 0, right: 1000, bottom: 600},
            dragEnd              : () => events.push('end'),
            dragProxy            : {style: {}},
            fire                 : () => {},
            gesture              : {abort: new AbortController(), id: 1, offsetX: 100, offsetY: 20,
                rect: {width: 960, height: 560}, x: 20, y: 20},
            owner   : {focus() {}, setTearOutSourceVisible: visible => visibility.push(visible), style: {}, tearOut: host},
            windowId: 1
        })
    });

    test.afterEach(() => {
        zone.destroy();
        Neo.main.addon.DragDrop = addon
    });

    test('half visible stays at home; a smaller vessel returns on the first genuine inward move', async () => {
        zone.dragMove(frame(520));
        expect(events).toEqual([]);
        zone.dragMove(frame(521));
        admit(grant);
        await Promise.resolve();
        host.currentSize = {width: 780, height: 500};
        zone.dragMove(frame(521));
        zone.dragMove(frame(522));
        expect(events).toEqual(['open', 'follow']);
        zone.dragMove(frame(430));
        zone.dragMove(frame(350));
        await zone.finishGesture(frame(20));
        expect(events).toEqual(['open', 'follow', 'restore', 'end']);
        expect(visibility).toEqual([false, true])
    });

    test('a vessel larger than the workspace can return by covering it', async () => {
        zone.dragMove(frame(521));
        admit(grant);
        await Promise.resolve();
        host.currentSize = {width: 2400, height: 1400};
        zone.dragMove(frame(521));
        zone.dragMove(frame(200));
        expect(events).toEqual(['open', 'follow', 'restore'])
    });

    test('a shared-worker phone stays clamped while a wider touchscreen still admits a mouse drag', async () => {
        zone.gesture = null;
        zone.dragElement = {id: 'app'};
        zone.owner.cls = [];
        zone.createDragProxy = async () => {zone.dragProxy = {style: {}}};
        let configs;
        Neo.main.addon.DragDrop.setConfigs = async data => {
            configs = data;
            return {boundaryContainerRect: {left: 0, top: 0, right: 1000, bottom: 600}}
        };
        const start = async viewportWidth => zone.dragStart({
            clientX: 120, clientY: 40, gestureId: 2,
            path   : [{id: 'app', rect: {left: 20, top: 20, width: 960, height: 560}},
                {tagName: 'html', clientWidth: viewportWidth}]
        });

        await start(390);
        expect(configs.allowOverdrag).toBe(false);
        zone.dragMove(frame(600));
        expect(events).toEqual([]);
        await zone.finishGesture(frame(600));
        await start(1280);
        expect(configs.allowOverdrag).toBe(true);
        zone.dragMove(frame(600));
        expect(events).toContain('open')
    });

    test('a late admission after source return or cancellation cannot regain the pointer', async () => {
        zone.dragMove(frame(525));
        zone.dragMove(frame(400));
        admit(grant);
        await Promise.resolve();
        expect(events).toEqual(['open', 'restore']);
        zone.dragMove(frame(525));
        zone.onDragCancel({});
        admit(grant);
        await Promise.resolve();
        await zone.finishGesture(frame(525));
        expect(events).toEqual(['open', 'restore', 'open', 'restore', 'end'])
    });

    test('an outside release commits the admitted popup once', async () => {
        zone.dragMove(frame(525));
        admit(grant);
        await Promise.resolve();
        await zone.finishGesture(frame(540));
        await zone.finishGesture(frame(540));
        expect(events).toEqual(['open', 'follow', 'commit', 'end'])
    });

    test('a denied popup leaves the source reachable without reopening on every frame', async () => {
        zone.dragMove(frame(525));
        admit(null);
        await Promise.resolve();
        expect(zone.dragProxy.style.left).toBe('40px');
        zone.dragMove(frame(680));
        await zone.finishGesture(frame(680));
        expect(events).toEqual(['open', 'end']);
        expect(zone.owner.style.left).toBe('40px')
    });

    test('a local release fits the whole dialog into the workspace measured at release', async () => {
        const {owner} = zone,
              bounds  = Promise.withResolvers(),
              reads   = [];

        owner.boundaryContainerId = 'workspace';
        owner.getDomRect = id => {
            reads.push(id);
            return bounds.promise
        };

        const release = zone.finishGesture(frame(600));
        expect(reads).toEqual(['workspace']);
        expect(events).toEqual([]);

        bounds.resolve({left: 100, top: 30, right: 890, bottom: 490, width: 790, height: 460});
        await release;

        expect(owner.style).toMatchObject({left: '100px', top: '30px', width: '790px', height: '460px'});
        expect(events).toEqual(['end'])
    })
});
