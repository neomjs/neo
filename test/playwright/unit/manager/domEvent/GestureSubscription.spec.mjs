import {setup} from '../../../setup.mjs';

const appName = 'DomEventGestureSubscriptionTest';

setup({appConfig: {name: appName}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import DomEvent       from '../../../../../src/manager/DomEvent.mjs';

test('local gesture listeners share a window registration until the last observer leaves', async () => {
    const id        = 'gesture-target',
          windowId  = 'gesture-window',
          component = {appName, id, mounted: true, vdom: {id}, windowId},
          first     = {'pan:move': function observeFirstPan() {}},
          second    = {'pan:move': function observeSecondPan() {}},
          calls     = [],
          original  = Neo.currentWorker.getAddon;

    Neo.currentWorker.getAddon = async (name, targetWindow) => {
        calls.push(['load', name, targetWindow]);

        return {
            register(data)   { calls.push(['register', data]) },
            unregister(data) { calls.push(['unregister', data]) }
        }
    };

    try {
        DomEvent.mountDomListeners(component);
        expect(calls).toEqual([]);

        DomEvent.updateDomListeners(component, [first, second], []);
        await expect.poll(() => calls.map(([operation]) => operation)).toEqual(['load', 'register']);
        expect(calls[1][1]).toMatchObject({componentId: id, events: ['pan:move'], id, windowId});

        DomEvent.updateDomListeners(component, [second], [first, second]);
        DomEvent.mountDomListeners(component);
        expect(DomEvent.getListener({eventName: 'pan:move', id})).toHaveLength(1);
        expect(calls.map(([operation]) => operation)).toEqual(['load', 'register']);

        DomEvent.updateDomListeners(component, [], [second]);
        await expect.poll(() => calls.map(([operation]) => operation)).toEqual(['load', 'register', 'unregister']);
        expect(calls[2][1]).toMatchObject({componentId: id, id, windowId});
    } finally {
        clearTimeout(DomEvent.mountTimeouts[id]);
        delete DomEvent.mountTimeouts[id];
        DomEvent.updateDomListeners(component, [], [first, second]);
        Neo.currentWorker.getAddon = original
    }
});

test('unmount fences a registration waiting for the Main addon', async () => {
    const id        = 'unmounting-gesture-target',
          component = {appName, id, mounted: true, vdom: {id}, windowId: 'gesture-window'},
          listeners = [{tap() {}}],
          calls     = [],
          original  = Neo.currentWorker.getAddon,
          addon     = {register: () => calls.push('register'), unregister: () => calls.push('unregister')};

    let resolveAddon;

    Neo.currentWorker.getAddon = () => new Promise(resolve => {resolveAddon = resolve});

    try {
        DomEvent.updateDomListeners(component, listeners, []);
        await expect.poll(() => typeof resolveAddon).toBe('function');

        component.mounted = false;
        DomEvent.resetMountedDomListeners(component);
        resolveAddon(addon);
        await new Promise(resolve => setImmediate(resolve));
        expect(calls).toEqual([]);

        Neo.currentWorker.getAddon = async () => addon;
        component.mounted = true;
        DomEvent.mountDomListeners(component);
        await expect.poll(() => calls).toEqual(['register']);

        DomEvent.updateDomListeners(component, [], listeners);
        await expect.poll(() => calls).toEqual(['register', 'unregister']);
    } finally {
        clearTimeout(DomEvent.mountTimeouts[id]);
        delete DomEvent.mountTimeouts[id];
        DomEvent.updateDomListeners(component, [], listeners);
        Neo.currentWorker.getAddon = original
    }
});

test('window departure cancels its open gesture and fences stale delivery from that window', async () => {
    const registrations = new Map(),
          original      = Neo.currentWorker.getAddon,
          components    = ['window-a', 'window-b'].map(windowId => {
              const id = `gesture-${windowId}`, phases = [];

              return {appName, id, mounted: true, phases, vdom: {id}, windowId}
          }),
          listeners = components.map(component => [{
              'pan:start' : data => component.phases.push(data.phase),
              'pan:end'   : data => component.phases.push(data.phase),
              'pan:cancel': data => component.phases.push(data.phase)
          }]);

    Neo.currentWorker.getAddon = async () => ({
        register(data) { registrations.set(data.windowId, data) },
        unregister() {}
    });

    try {
        components.forEach((component, i) => DomEvent.updateDomListeners(component, listeners[i], []));
        await expect.poll(() => registrations.size).toBe(2);

        const deliver = (component, phase) => {
            const {componentId, id, registrationId} = registrations.get(component.windowId);

            DomEvent.fire({
                eventName: `pan:${phase}`,
                windowId : component.windowId,
                data     : {
                    contacts    : [{id: 0, x: 20, y: 30}],
                    gestureId   : 1,
                    gestureOwner: {componentId, id, registrationId},
                    path        : [{id}],
                    phase
                }
            })
        };

        const [departed, live] = components;

        deliver(departed, 'start');
        deliver(live, 'start');
        DomEvent.releaseWindowGestures(departed.windowId);
        deliver(departed, 'end');
        deliver(live, 'end');

        expect(departed.phases).toEqual(['start', 'cancel']);
        expect(live.phases).toEqual(['start', 'end'])
    } finally {
        components.forEach((component, i) => {
            clearTimeout(DomEvent.mountTimeouts[component.id]);
            delete DomEvent.mountTimeouts[component.id];
            DomEvent.updateDomListeners(component, [], listeners[i])
        });
        Neo.currentWorker.getAddon = original
    }
});

test('a new component with the same id mounts before the old Main release acknowledges', async () => {
    const id       = 'recreated-gesture-target',
          windowId = 'recreated-gesture-window',
          first    = {appName, id, mounted: true, vdom: {id}, windowId},
          second   = {...first},
          previous = [{tap() {}}],
          observed = [],
          current  = [{tap: event => observed.push(event.component)}],
          calls    = [],
          original = Neo.currentWorker.getAddon;

    let acknowledge;

    Neo.currentWorker.getAddon = async () => ({
        register(data) { calls.push(data) },
        unregister: () => new Promise(resolve => {acknowledge = resolve})
    });

    try {
        DomEvent.updateDomListeners(first, previous, []);
        await expect.poll(() => calls.length).toBe(1);

        first.isDestroyed = true;
        DomEvent.updateDomListeners(first, [], previous);
        await expect.poll(() => typeof acknowledge).toBe('function');

        DomEvent.updateDomListeners(second, current, []);
        DomEvent.mountDomListeners(second);
        acknowledge();
        await expect.poll(() => calls.length).toBe(2);
        expect(calls[1].registrationId).not.toBe(calls[0].registrationId);

        for (const {componentId, registrationId} of calls) {
            DomEvent.fire({
                eventName: 'tap', windowId,
                data     : {gestureOwner: {componentId, id, registrationId}, path: [{id}]}
            })
        }

        expect(observed).toEqual([second])
    } finally {
        clearTimeout(DomEvent.mountTimeouts[id]);
        delete DomEvent.mountTimeouts[id];
        DomEvent.updateDomListeners(second, [], current);
        DomEvent.releaseWindowGestures(windowId);
        Neo.currentWorker.getAddon = original
    }
});
