import {test, expect}                           from '@playwright/test';
import {gestureLimits, normalizeGestureRequest} from '../../../../../src/ai/client/gestureTrace.mjs';

const request = {provider: 'engine', target: 'canvas', windowId: 'one'},
      contact = (id, state, x=20, y=30) => ({id, state, x, y}),
      frame   = (t, ...contacts) => ({t, contacts}),
      eight   = [
          frame(0, contact('A', 'down')),
          frame(8, contact('B', 'down', 55)),
          frame(16, contact('B', 'up', 55)),
          frame(24, contact('A', 'move', 37)),
          frame(32, contact('A', 'cancel', 37)),
          frame(40, contact('C', 'down')),
          frame(48, contact('C', 'move', 41)),
          frame(56, contact('C', 'up', 41))
      ];

test('compiles the eight-contact witness without losing logical labels or the two terminal states', () => {
    const before = structuredClone(eight),
          result = normalizeGestureRequest({...request, frames: eight}),
          events = result.frames.flatMap(entry => entry.events),
          labels = points => points.map(point => point.id).join('');

    expect(events.map(({active, changed}) => [labels(active), labels(changed)])).toEqual([
        ['A', 'A'], ['AB', 'B'], ['A', 'B'], ['A', 'A'], ['', 'A'], ['C', 'C'], ['C', 'C'], ['', 'C']
    ]);
    expect(events.flatMap(event => event.terminal ? [event.terminal] : [])).toEqual(['cancel', 'end']);
    expect(new Set(events.flatMap(event => event.changed.filter(point => point.id === 'A').map(point => point.identifier))).size).toBe(1);
    expect(eight).toEqual(before)
});

test('keeps omitted coordinates and distinguishes quiet frames from explicitly requested moves', () => {
    const frames = [frame(0, contact(1, 'down'), contact('1', 'down', 44)), frame(20),
              frame(30, contact(1, 'move')), frame(40, contact(1, 'up'), contact('1', 'up', 44))],
          plan   = normalizeGestureRequest({...request, frames}).frames;

    expect(plan[1].events).toEqual([]);
    expect(plan[2].events[0]).toMatchObject({
        active : [{id: 1, x: 20, identifier: 1}, {id: '1', x: 44, identifier: 2}],
        changed: [{id: 1, x: 20}],
        type   : 'touchmove'
    })
});

test('opens the replacement before closing the old contact in a mixed frame', () => {
    const frames = [frame(0, contact('A', 'down')), frame(10, contact('A', 'up'), contact('B', 'down')),
              frame(20, contact('B', 'up'))],
          events = normalizeGestureRequest({...request, frames}).frames[1].events;

    expect(events.map(event => [event.type, event.active.map(point => point.id), event.terminal])).toEqual([
        ['touchstart', ['A', 'B'], null], ['touchend', ['B'], null]
    ])
});

test('rejects late malformed frames, open traces, and invalid preset budgets', () => {
    const start = frame(0, contact('A', 'down'));

    for (const invalid of [
        frame(10, contact('A', 'down')), frame(10, contact('B', 'move')), frame(10, contact('B', 'up')),
        frame(10, contact('B', 'cancel')), frame(10, contact('A', 'move'), contact('A', 'up')),
        frame(10, contact('A', 'up', Infinity)), frame(-1, contact('A', 'up')),
        frame(gestureLimits.durationMs + 1, contact('A', 'up')), frame(10, contact('A', ['up']))
    ]) {
        expect(() => normalizeGestureRequest({...request, frames: [start, invalid]})).toThrow(TypeError)
    }

    expect(() => normalizeGestureRequest({...request, frames: [start]})).toThrow('release or cancel');
    expect(() => normalizeGestureRequest({...request, frames: [start, , frame(20, contact('A', 'up'))]})).toThrow(TypeError);
    expect(() => normalizeGestureRequest({...request, preset: {kind: 'swipe', steps: gestureLimits.frames - 1}})).toThrow('frame limit')
});

test('expands hold and transform presets through the bounded frame contract', () => {
    const at = {x: 80, y: 110};

    const hold = normalizeGestureRequest({...request, preset: {kind: 'hold', at, durationMs: 540}});
    expect(hold.frames.map(({t, events}) => [t, events[0].type, events[0].changed[0].x])).toEqual([
        [0, 'touchstart', 80], [540, 'touchend', 80]
    ]);

    const pinch  = normalizeGestureRequest({...request, preset: {kind: 'pinch', center: at, fromRadius: 15, toRadius: 40, steps: 1}}),
          rotate = normalizeGestureRequest({...request, preset: {kind: 'rotate', center: at, radius: 20, degrees: 90, steps: 1}}),
          swipe  = normalizeGestureRequest({...request, preset: {kind: 'swipe', from: at, to: {x: 120, y: 110}, steps: gestureLimits.frames - 2}});

    expect(pinch.frames[1].events[0].changed).toMatchObject([{x: 40, y: 110}, {x: 120, y: 110}]);
    expect(rotate.frames[1].events[0].changed.map(point => Math.round(point.y))).toEqual([90, 130]);
    expect(swipe.frames).toHaveLength(gestureLimits.frames)
});
