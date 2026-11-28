import {setup} from '../../../setup.mjs';

const appName = 'DomEventGestureSubscriptionTest';

setup({appConfig: {name: appName}});

import {test, expect}   from '@playwright/test';
import Neo              from '../../../../../src/Neo.mjs';
import * as core        from '../../../../../src/core/_export.mjs';
import ComponentManager from '../../../../../src/manager/Component.mjs';
import DomEvent         from '../../../../../src/manager/DomEvent.mjs';

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

test('tap filters stay in App and match each listener on the logical path', async () => {
    const id        = 'tap-filter-target',
          parentId  = 'tap-filter-parent',
          windowId  = 'tap-filter-window',
          parent    = {appName, id: parentId, mounted: true, vdom: {id: parentId}, windowId},
          target    = {appName, id, mounted: true, parent, parentId, vdom: {id}, windowId},
          calls     = new Map(),
          received  = [],
          wildcard  = [],
          invalid   = [],
          original  = Neo.currentWorker.getAddon,
          observe   = ({component, contactCount, count}) => received.push([component.id, count, contactCount]),
          listeners = [
              {tap: {fn: observe, count: 1, contactCount: 1}},
              {tap: {fn: observe, count: 2, contactCount: 1}},
              {tap: {fn: () => invalid.push(true), count: 0}},
              {tap: ({count}) => wildcard.push(count)}
          ],
          inherited = [{tap: {fn: observe, count: 2, contactCount: 2}}];

    Neo.currentWorker.getAddon = async () => ({
        register(data) { calls.set(data.id, data) },
        unregister() {}
    });

    try {
        ComponentManager.register(parent);
        ComponentManager.register(target);
        DomEvent.updateDomListeners(parent, inherited, []);
        DomEvent.updateDomListeners(target, listeners, []);
        await expect.poll(() => calls.size).toBe(2);
        expect([...calls.values()].map(data => data.events)).toEqual([['tap'], ['tap']]);
        expect([...calls.values()].every(data => !Object.hasOwn(data, 'gestureOptions'))).toBe(true);

        const {componentId, registrationId} = calls.get(id);

        for (const [count, contactCount] of [[1, 1], [2, 1], [2, 2], [3, 2]]) {
            DomEvent.fire({
                eventName: 'tap', windowId,
                data     : {contactCount, count, gestureOwner: {componentId, id, registrationId}, path: [{id}, {id: parentId}]}
            })
        }

        expect(received).toEqual([[id, 1, 1], [id, 2, 1], [parentId, 2, 2]]);
        expect(wildcard).toEqual([1, 2, 2, 3]);
        expect(invalid).toEqual([])
    } finally {
        for (const [component, registered] of [[target, listeners], [parent, inherited]]) {
            clearTimeout(DomEvent.mountTimeouts[component.id]);
            delete DomEvent.mountTimeouts[component.id];
            DomEvent.updateDomListeners(component, [], registered);
            ComponentManager.unregister(component)
        }

        DomEvent.releaseWindowGestures(windowId);
        Neo.currentWorker.getAddon = original
    }
});

test('the highest-priority press policy is sent and a policy change cancels the old registration', async () => {
    const id        = 'press-policy-target',
          windowId  = 'press-policy-window',
          component = {appName, id, mounted: true, vdom: {id}, windowId},
          calls     = [],
          phases    = [],
          original  = Neo.currentWorker.getAddon,
          observe   = ({phase}) => phases.push(phase),
          lower     = {'press:start': {fn() {}, holdMs: 350, moveTolerance: 4, priority: 1}},
          higher    = {'press:start': {fn: observe, holdMs: 120, moveTolerance: 0, priority: 2}},
          replaced  = {'press:start': {...higher['press:start'], fn() { phases.push('replacement') }}},
          invalid   = {'press:start': {fn() {}, holdMs: 2_147_483_648, moveTolerance: -1, priority: 3}},
          partial   = {'press:start': {fn() {}, holdMs: 120, priority: 3}},
          terminals = [{'press:cancel': observe}, {'press:end': observe}];

    let listeners = [];

    const update = next => {
        DomEvent.updateDomListeners(component, next, listeners);
        listeners = next;
        DomEvent.mountDomListeners(component)
    };

    const deliver = ({componentId, registrationId}, phase, gestureId) => {
        DomEvent.fire({
            eventName: `press:${phase}`, windowId,
            data     : {contacts: [{id: 0}], gestureId, gestureOwner: {componentId, id, registrationId}, path: [{id}], phase}
        })
    };

    Neo.currentWorker.getAddon = async () => ({
        register(data) { calls.push(data) },
        unregister() {}
    });

    try {
        update([lower, higher, ...terminals]);
        await expect.poll(() => calls.length).toBe(1);
        expect(calls[0].gestureOptions).toEqual({press: {holdMs: 120, moveTolerance: 0}});

        deliver(calls[0], 'start', 1);
        update([lower, replaced, ...terminals]);
        await new Promise(resolve => setImmediate(resolve));
        expect(calls).toHaveLength(1);
        expect(phases).toEqual(['start']);

        update([lower, ...terminals]);
        expect(phases).toEqual(['start', 'cancel']);
        deliver(calls[0], 'end', 1);
        await expect.poll(() => calls.length).toBe(2);
        expect(calls[1].registrationId).not.toBe(calls[0].registrationId);
        expect(calls[1].gestureOptions).toEqual({press: {holdMs: 350, moveTolerance: 4}});
        expect(phases).toEqual(['start', 'cancel']);

        deliver(calls[1], 'start', 2);
        deliver(calls[1], 'end', 2);
        expect(phases).toEqual(['start', 'cancel', 'end']);

        update([lower, invalid, ...terminals]);
        await expect.poll(() => calls.length).toBe(3);
        expect(calls[2].registrationId).not.toBe(calls[1].registrationId);
        expect(calls[2]).not.toHaveProperty('gestureOptions');

        update([lower, partial, ...terminals]);
        await expect.poll(() => calls.length).toBe(4);
        expect(calls[3].registrationId).not.toBe(calls[2].registrationId);
        expect(calls[3].gestureOptions).toEqual({press: {holdMs: 120}})
    } finally {
        clearTimeout(DomEvent.mountTimeouts[id]);
        delete DomEvent.mountTimeouts[id];
        DomEvent.updateDomListeners(component, [], listeners);
        DomEvent.releaseWindowGestures(windowId);
        Neo.currentWorker.getAddon = original
    }
});
