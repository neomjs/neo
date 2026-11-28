import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'GestureTransformUnit'}, neoConfig: {unitTestMode: true}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

const originalDocument = globalThis.document,
      originalWindow   = globalThis.window,
      originalRemotes  = {DomAccess: Neo.main.DomAccess, DomEvents: Neo.main.DomEvents},
      documentRef      = new EventTarget(),
      windowRef        = new EventTarget(),
      pending          = new Map();

let sequenceId = 0;

documentRef.body            = new EventTarget();
documentRef.documentElement = {};
documentRef.defaultView     = windowRef;
windowRef.requestAnimationFrame = callback => {
    const id = ++sequenceId;
    pending.set(id, callback);
    return id
};
windowRef.cancelAnimationFrame = id => pending.delete(id);
globalThis.document = documentRef;
globalThis.window   = windowRef;
Neo.worker.Manager.on ??= () => {};

delete Neo.main.DomAccess;

const {default: Gesture}   = await import('../../../../../src/main/addon/Gesture.mjs'),
      {default: DomEvents} = await import('../../../../../src/main/DomEvents.mjs'),
      originalSend         = DomEvents.sendMessageToApp;

/** @summary Flushes the owning document's currently scheduled animation frame. */
function flush() {
    const callbacks = [...pending.values()];
    pending.clear();
    callbacks.forEach(callback => callback())
}

const point = (id, x, y) => ({id, x, y});

let addon, messages;

test.beforeEach(() => {
    pending.clear();
    messages = [];
    DomEvents.sendMessageToApp = data => messages.push(data);
    addon = Neo.create(Gesture)
});

test.afterEach(() => {
    addon.destroy();
    DomEvents.sendMessageToApp = originalSend
});

test.afterAll(() => {
    globalThis.document = originalDocument;
    globalThis.window   = originalWindow;
    Object.assign(Neo.main, originalRemotes)
});

/**
 * @param {String} family
 * @returns {Object} A claim and its Main-local contact-sample entry point.
 */
function createClaim(family) {
    const sequence = {claims: new Map(), path: [], pointerType: 'touch'},
          claim    = {family, gestureId: null, live: true, owner: {componentId: 'test', id: 'root', registrationId: 1}, sequence};

    sequence.claims.set(family, claim);

    return {
        claim,
        send(kind, contacts, elapsed, changed=contacts.map(({id}) => id)) {
            claim.frame = {changed, contacts, elapsed, pointerType: 'touch', trusted: false};
            addon.fire('contact', {claim, kind, ...claim.frame})
        }
    }
}

test('an opted-in touch pan reads the scroll offset only at first contact', () => {
    const id    = 'boundary-pan',
          node  = {id, dataset: {neoId: id}, scrollTop: 80},
          event = {composedPath: () => [node], isTrusted: true, timeStamp: 0},
          read  = DomEvents.getEventData;

    DomEvents.getEventData = () => ({path: []});

    try {
        addon.register({componentId: id, id, registrationId: 1, events: ['pan:start'], gestureOptions: {pan: {atScrollStart: true}}});

        const midList = addon.createSequence(event, 'touch');
        expect(midList.claims.has('pan')).toBe(false);

        node.scrollTop = 0;
        expect(midList.claims.has('pan')).toBe(false);
        expect(addon.createSequence(event, 'touch').claims.has('pan')).toBe(true);
        expect(addon.createSequence(event, 'mouse').claims.has('pan')).toBe(false);

        addon.register({componentId: id, id, registrationId: 2, events: ['pan:start']});
        node.scrollTop = 80;
        expect(addon.createSequence(event, 'touch').claims.has('pan')).toBe(true)
    } finally {
        DomEvents.getEventData = read
    }
});

test('rotation uses stable pair order and accumulates 270 degrees before one paint', () => {
    const {send} = createClaim('rotate'),
          center = point(0, 100, 100),
          over   = point(1, 140, 100);

    send('start', [center, over], 0);
    send('move', [point(1, 100, 140), center], 1, [1]);
    send('move', [center, point(1, 60, 100)], 2, [1]);
    send('move', [point(1, 100, 60), center], 3, [1]);

    expect(pending.size).toBe(1);
    expect(messages.map(({phase}) => phase)).toEqual(['start']);
    flush();

    expect(messages.map(({phase}) => phase)).toEqual(['start', 'move']);
    expect(messages[0]).toMatchObject({rotation: 0, x: 120, y: 100});
    expect(messages[1]).toMatchObject({rotation: 270, x: 100, y: 80, changed: [1]});
    expect(messages[1].gestureId).toBe(messages[0].gestureId)
});

test('pinch preserves finite totals at near overlap and rebase, then carries its latest geometry to end', () => {
    const {send} = createClaim('pinch');

    send('start', [point(0, 50, 100), point(1, 90, 100)], 0);
    send('move', [point(0, 30, 110), point(1, 110, 110)], 20);
    flush();
    expect(messages[1]).toMatchObject({phase: 'move', scale: 2, x: 70, y: 110});

    send('move', [point(0, 70, 110), point(1, 70, 110)], 22);
    send('move', [point(0, 50, 110), point(1, 90, 110)], 24);
    send('move', [point(0, 55, 120), point(1, 75, 120)], 26);
    const stale = [...pending.values()][0];

    send('end', [point(1, 75, 120)], 30, [0]);
    expect(pending.size).toBe(0);
    expect(messages.at(-1)).toMatchObject({phase: 'end', scale: 1, x: 65, y: 120, elapsed: 30, contacts: [], changed: [0]});
    stale();
    expect(messages.map(({phase}) => phase)).toEqual(['start', 'move', 'end'])
});

test('a new pair uses zero-based public ids and the surviving contact’s down time', () => {
    const {send} = createClaim('rotate');

    send('start', [point(3, 100, 100)], 10, [3]);
    send('start', [point(3, 100, 100), point(4, 60, 101)], 40, [4]);
    send('move', [point(3, 100, 100), point(4, 60, 99)], 45, [4]);
    flush();
    expect(messages[0]).toMatchObject({phase: 'start', elapsed: 30, contacts: [{id: 0}, {id: 1}], changed: [1]});
    expect(messages[1].rotation).toBeCloseTo(2.864, 2);

    send('end', [point(4, 60, 99)], 60, [3]);
    send('start', [point(4, 60, 99), point(6, 60, 130)], 100, [6]);

    expect(messages[3]).toMatchObject({phase: 'start', rotation: 0, elapsed: 60, contacts: [{id: 0}, {id: 1}], changed: [1]});
    expect(messages[3].gestureId).not.toBe(messages[0].gestureId);
    send('cancel', [], 150, [4, 6]);
    expect(messages[4]).toMatchObject({phase: 'cancel', rotation: 0, elapsed: 110, contacts: [], changed: [0, 1]})
});

test('three-contact membership changes rebase without changing the active gesture', () => {
    const {send} = createClaim('pinch'),
          a      = point(0, 100, 100), b = point(1, 180, 100), c = point(2, 200, 100);

    send('start', [a, point(1, 140, 100)], 0);
    send('move', [a, b], 10, [1]);
    flush();
    expect(messages.at(-1).scale).toBe(2);

    send('start', [a, b, c], 20, [2]);
    flush();
    expect(messages.at(-1)).toMatchObject({phase: 'move', contacts: [{id: 0}, {id: 1}, {id: 2}], scale: 2});
    expect(messages.at(-1).x).toBeCloseTo(160, 8);

    send('end', [b, c], 30, [0]);
    flush();
    expect(messages.at(-1)).toMatchObject({phase: 'move', changed: [0], contacts: [{id: 1}, {id: 2}], x: 190, scale: 2});

    send('move', [b, point(2, 220, 100)], 40, [2]);
    flush();
    expect(messages.at(-1)).toMatchObject({phase: 'move', scale: 4, x: 200});
    expect(new Set(messages.map(({gestureId}) => gestureId)).size).toBe(1)
});
