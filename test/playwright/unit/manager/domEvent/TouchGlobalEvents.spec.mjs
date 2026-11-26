import {setup} from '../../../setup.mjs';

const appName = 'DomEventTouchGlobalEventsTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import DomEvent       from '../../../../../src/manager/DomEvent.mjs';

test.describe('Neo.manager.DomEvent touch listener mounting', () => {
    let sentMessages, originalPromiseMessage, originalWorker;

    test.beforeEach(() => {
        sentMessages           = [];
        originalWorker         = Neo.currentWorker;
        originalPromiseMessage = Neo.worker.App.promiseMessage;

        Neo.currentWorker             = {isWindowDeparted: () => false};
        Neo.worker.App.promiseMessage = (windowId, payload) => {
            sentMessages.push({payload, windowId});
            return Promise.resolve({success: true})
        }
    });

    test.afterEach(() => {
        Neo.worker.App.promiseMessage = originalPromiseMessage;
        Neo.currentWorker             = originalWorker
    });

    test('treats touchend and touchcancel as global body events and maps explicit local touch listeners to TouchDomEvents handlers', () => {
        const component = {
            appName,
            domListeners: [
                {touchcancel: () => {}},
                {touchend   : () => {}},
                {touchmove  : () => {}},
                {touchstart : () => {}}
            ],
            id      : 'cmp-touch-global',
            mounted : true,
            vdom    : {id: 'cmp-touch-global'},
            windowId: 1
        };

        DomEvent.updateDomListeners(component, component.domListeners, []);
        clearTimeout(DomEvent.mountTimeouts[component.id]);
        delete DomEvent.mountTimeouts[component.id];
        DomEvent.mountDomListeners(component);

        // Global body listeners already forward touchstart, touchmove, touchend, and touchcancel
        expect(sentMessages).toEqual([]);

        const localComponent = {
            appName,
            domListeners: [
                {local: true, touchcancel: () => {}},
                {touchend: {fn: () => {}, local: true}}
            ],
            id      : 'cmp-touch-local',
            mounted : true,
            vdom    : {id: 'cmp-touch-local'},
            windowId: 1
        };

        DomEvent.updateDomListeners(localComponent, localComponent.domListeners, []);
        clearTimeout(DomEvent.mountTimeouts[localComponent.id]);
        delete DomEvent.mountTimeouts[localComponent.id];
        DomEvent.mountDomListeners(localComponent);

        expect(sentMessages).toHaveLength(1);
        expect(sentMessages[0].payload.events.map(e => ({handler: e.handler, name: e.name}))).toEqual([
            {handler: 'onTouchCancel', name: 'touchcancel'},
            {handler: 'onTouchEnd',    name: 'touchend'}
        ])
    })
});
