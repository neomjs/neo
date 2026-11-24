import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'HeaderGeometryTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import header         from '../../../../src/canvas/Header.mjs';

const width = 1992, height = 58,
      text  = {id: 'text', x: 120, y: 10, width: 120, height: 38},
      icon  = {id: 'icon', x: 400, y: 10, width: 38, height: 38},
      // Frozen from the unmodified renderer at c84fae6fcc. Columns are offsetY, intensity and isIconZone.
      cases = [
          {name: 'empty space', rects: [], mouse: {x: -1000, y: -1000}, xs: [0, 42, 996, 1990],
              expected: [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]},
          {name: 'text link', rects: [text], mouse: {x: -1000, y: -1000}, xs: [80, 100, 120, 150, 180, 220, 240, 280],
              expected: [[0, 0, 0], [1.814338553438, 0, 0], [6.564338553438, 0, 0], [15.0839598967785, 0, 0],
                  [19, 0, 0], [12.435661446562, 0, 0], [6.564338553438, 0, 0], [0, 0, 0]]},
          {name: 'icon and nearby pointer', rects: [icon], mouse: {x: 419, y: 29}, xs: [360, 380, 400, 419, 438, 458, 478],
              expected: [[0, 0, 0], [0.325252801481329, 1, 0.0171185684990173], [8.51326759618202, 1, 0.448066715588527],
                  [19, 1, 1], [8.51326759618202, 1, 0.448066715588527], [0.325252801481329, 1, 0.0171185684990173], [0, 0, 0]]},
          {name: 'overlapping influence and offset pointer', rects: [text, {...icon, x: 200}], mouse: {x: 210, y: 45},
              xs      : [160, 200, 210, 219, 238, 258, 280],
              expected: [[17.185661446562, 0.773333333333333, 0], [17.185661446562, 0.877616268328761, 0.448066715588527],
                  [15.9669653491861, 0.877616268328761, 0.840366597325586], [19, 0.877616268328761, 1],
                  [8.51326759618202, 0.877616268328761, 0.448066715588527],
                  [2.18012419363, 0.877616268328761, 0.0171185684990173], [0, 0, 0]]}
      ];

test.afterEach(() => header.clearGraph());

for (const {name, rects, mouse, xs, expected} of cases) {
    test(`stream geometry preserves the released ${name} values`, () => {
        header.navRects = rects;
        Object.assign(header.mouse, mouse);
        for (let i = 0; i < xs.length; i++) {
            const result = header.getStreamOffset(xs[i], height, width);
            for (const [j, key] of ['offsetY', 'intensity', 'isIconZone'].entries()) {
                expect(result[key], `${key} at x=${xs[i]}`).toBeCloseTo(expected[i][j], 10)
            }
        }
    })
}

test('ordinary callers retain independent results after later queries and strand calculations', () => {
    header.navRects = [icon];
    Object.assign(header.mouse, {x: 419, y: 29});
    const first = header.getStreamOffset(419, height, width), retained = {...first},
          next  = header.getStreamOffset(0, height, width);
    expect(next).not.toBe(first);
    header.updateResources(width, height);
    header.calculateStrandGeometry(width, height);
    expect(first).toEqual(retained);
    expect(next).toEqual({offsetY: 0, intensity: 0, isIconZone: 0})
});

test('a supplied output is reused and overwritten, including clearing values in empty space', () => {
    header.navRects = [icon];
    Object.assign(header.mouse, {x: 419, y: 29});
    const output = {};
    expect(header.getStreamOffset(419, height, width, output)).toBe(output);
    expect(output).toEqual({offsetY: 19, intensity: 1, isIconZone: 1});
    expect(header.getStreamOffset(0, height, width, output)).toBe(output);
    expect(output).toEqual({offsetY: 0, intensity: 0, isIconZone: 0})
});

test('two animated frames reuse one result for every sample and preserve the allocating geometry', () => {
    header.navRects = [text, icon];
    Object.assign(header.mouse, {x: 185, y: 35});
    header.updateResources(width, height);
    header.time = 7;
    header.still = false;
    const original = header.getStreamOffset, outputs = new Set();
    let   calls    = 0, reused = 0;
    try {
        header.getStreamOffset = function(x, h, w, output) {
            const result = original.call(this, x, h, w, output);
            calls++;
            if (output && result === output) reused++;
            outputs.add(result);
            return result
        };
        header.calculateStrandGeometry(width, height);
        const first = {a: [...header.waveBuffers.fgA], b: [...header.waveBuffers.fgB]};
        header.calculateStrandGeometry(width, height);
        expect(calls).toBe(2 * Math.ceil(width / 2));
        expect(reused, 'every sample writes into caller-owned storage').toBe(calls);
        expect(outputs.size, 'storage is also reused across frames').toBe(1);

        header.getStreamOffset = function(x, h, w) {return original.call(this, x, h, w)};
        header.calculateStrandGeometry(width, height);
        expect([...header.waveBuffers.fgA]).toEqual(first.a);
        expect([...header.waveBuffers.fgB]).toEqual(first.b)
    } finally {
        header.getStreamOffset = original;
        header.still = true
    }
});
